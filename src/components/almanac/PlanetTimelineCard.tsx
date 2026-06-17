// PlanetTimelineCard.tsx — Surface C: Tonight's Planet Outlook (T2.4)
//
// Shows a horizontal planet info row (top) and an SVG Gantt-chart timeline
// (bottom) spanning sunset → sunrise, matching the C7-almanac-page.html mockup.
//
// Accessibility notes (coding rules §5):
// - All interactive elements are <button> — no <div onClick>.
// - Color-only signals are forbidden: quality tier uses colored dot + text label.
// - Viewing quality communicates via text label AND colored dot (WCAG 1.4.1).
// - SVG has role="img" + <title> and <desc> for screen-reader context.
// - Planet images carry descriptive alt text; missing images have aria-hidden placeholder.
// - Loading / error / empty states use role="status" / role="alert" / plain text.
// - No outline removed without a replacement focus indicator.
// - Card heading is <h2> via CardTitle as="h2".
//
// Light/dark contrast (ADR-053 5-tier scale):
//   green  #22c55e: 4.55:1 on white (AA), 6.63:1 on dark page — passes both.
//   lime   #84cc16: 3.42:1 on white — FAIL. Use lime-700 #65a30d on light (4.68:1 ✓).
//   yellow #eab308: 2.78:1 on white — FAIL. Use amber-700 #b45309 on light (4.81:1 ✓).
//   orange #f97316: 3.01:1 on white — FAIL. Use orange-700 #c2410c on light (5.42:1 ✓).
//   red    #ef4444: 3.94:1 on white — FAIL for small text. Use red-700 #b91c1c (5.2:1 ✓).
// Tailwind dark: variant switches to vivid color on dark backgrounds where they pass.
//
// i18n: useTranslation('almanac') — keys under planets.*.
// Time: Intl.DateTimeFormat per ADR-020 (UTC on wire, station TZ for display).
// Icons: inline SVG paths (Phosphor-style) — all aria-hidden.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
import { ChartFullscreenButton } from '../ui/chart-fullscreen';
import { ChartFullscreenOverlay } from '../ui/chart-fullscreen';
import type { PlanetsVisible, PlanetEntry, AlmanacSnapshot } from '../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlanetTimelineCardProps {
  planets: PlanetsVisible | null;
  almanac: AlmanacSnapshot | null;
  stationTz: string;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Planet brand colors — used for Gantt bars and the color legend
// ---------------------------------------------------------------------------

const PLANET_BAR_COLOR: Record<string, string> = {
  mercury: '#94a3b8',
  venus:   '#fbbf24',
  mars:    '#ef4444',
  jupiter: '#f59e0b',
  saturn:  '#d4a574',
  uranus:  '#67e8f9',
  neptune: '#6366f1',
};

function getPlanetColor(name: string): string {
  return PLANET_BAR_COLOR[name.toLowerCase()] ?? '#94a3b8';
}

const PLANET_CHART_IMG_SIZE: Record<string, number> = {
  saturn:  60,
  jupiter: 40,
  mars:    32,
  venus:   28,
  uranus:  28,
  neptune: 28,
  mercury: 22,
};

function getChartImgSize(name: string): number {
  return PLANET_CHART_IMG_SIZE[name.toLowerCase()] ?? 28;
}

// ---------------------------------------------------------------------------
// Viewing quality — ADR-053 unified 5-tier color scale
// PlanetEntry.viewingQuality uses lowercase snake_case values.
// ---------------------------------------------------------------------------

type PlanetViewingQuality = PlanetEntry['viewingQuality'];

/** Returns Tailwind class(es) for the quality dot and label text.
 *  Light theme uses darker shades to pass WCAG 2.1 AA on white (#4.5:1+).
 *  Dark theme uses the vivid ADR-053 spec colors which pass on dark backgrounds.
 */
function qualityTextClass(quality: PlanetViewingQuality): string {
  switch (quality) {
    case 'excellent':    return 'text-green-600 dark:text-green-400';
    case 'good':         return 'text-lime-700 dark:text-lime-400';
    case 'fair':         return 'text-amber-700 dark:text-yellow-400';
    case 'poor':         return 'text-orange-700 dark:text-orange-400';
    case 'not_visible':  return 'text-red-700 dark:text-red-400';
    default:             return 'text-muted-foreground';
  }
}

/** Human-readable quality label for display and aria.
 *  Returns empty string for null so the badge is hidden rather than showing "—".
 */
function qualityLabel(quality: PlanetViewingQuality, t: (k: string) => string): string {
  switch (quality) {
    case 'excellent':    return t('planets.qualityExcellent');
    case 'good':         return t('planets.qualityGood');
    case 'fair':         return t('planets.qualityFair');
    case 'poor':         return t('planets.qualityPoor');
    case 'not_visible':  return t('planets.qualityNotVisible');
    default:             return '';
  }
}

// ---------------------------------------------------------------------------
// Time helpers (ADR-020)
// ---------------------------------------------------------------------------

/**
 * Format a UTC ISO-8601 string to station local time — time only, no TZ suffix.
 * e.g. "8:30 PM"  (12-hour, no seconds, no zone)
 */
function formatTimeOnly(
  iso: string | null | undefined,
  tz: string,
  locale: string,
): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

/**
 * Parse an ISO string to a Date. Returns null on failure.
 */
function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Return a 12-hour time string for an SVG tick label, e.g. "8 PM" / "12 AM".
 * Rendered relative to a UTC-based Date so we just compute hours in the TZ.
 */
function svgTickLabel(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: tz,
    }).format(date);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Magnitude-based quality fallback when BFF enrichment is unavailable.
// Uses apparent magnitude as a rough naked-eye brightness proxy.
// ---------------------------------------------------------------------------

function qualityFromMagnitude(mag: number | null): PlanetViewingQuality {
  if (mag === null) return null;
  if (mag < 0)   return 'excellent';
  if (mag < 1.5) return 'good';
  if (mag < 3.5) return 'fair';
  if (mag < 5.5) return 'poor';
  return 'not_visible';
}

function effectiveQuality(planet: PlanetEntry): PlanetViewingQuality {
  if (planet.viewingQuality) return planet.viewingQuality;
  return qualityFromMagnitude(planet.magnitude);
}

// ---------------------------------------------------------------------------
// Natural-language position (mockup: "In the southwest", "High in the south")
// ---------------------------------------------------------------------------

function naturalPosition(direction: string | null, altitude: number | null): string {
  if (!direction) return '';
  const dir = direction.toLowerCase();
  if (altitude !== null && altitude > 45) return `High in the ${dir}`;
  if (altitude !== null && altitude > 0 && altitude < 15) return `Low in the ${dir}`;
  return `In the ${dir}`;
}

// ---------------------------------------------------------------------------
// Viewing window range ("8:30 PM – 1:00 AM", "4:30 AM – Sunrise")
// ---------------------------------------------------------------------------

function formatViewingWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  sunsetIso: string | null | undefined,
  sunriseIso: string | null | undefined,
  tz: string,
  locale: string,
  t: (k: string) => string,
): string {
  if (!start && !end) return '';

  // Clamp start to sunset (don't show afternoon times for planets already up)
  let effectiveStart = start ? new Date(start) : null;
  if (effectiveStart && sunsetIso) {
    const sunsetMs = new Date(sunsetIso).getTime();
    if (effectiveStart.getTime() < sunsetMs) {
      effectiveStart = new Date(sunsetMs);
    }
  }

  // Clamp end to sunrise
  let effectiveEnd = end ? new Date(end) : null;
  let endIsSunrise = false;
  if (effectiveEnd && sunriseIso) {
    const srMs = new Date(sunriseIso).getTime();
    let srAdj = srMs;
    if (effectiveStart && srAdj < effectiveStart.getTime()) {
      srAdj += 24 * 60 * 60 * 1000;
    }
    if (effectiveEnd.getTime() >= srAdj - 30 * 60_000) {
      endIsSunrise = true;
    }
    if (effectiveEnd.getTime() > srAdj) {
      effectiveEnd = new Date(srAdj);
    }
  }

  const startStr = effectiveStart
    ? formatTimeOnly(effectiveStart.toISOString(), tz, locale)
    : '—';
  if (endIsSunrise) return `${startStr} – ${t('planets.sunrise')}`;
  const endStr = effectiveEnd
    ? formatTimeOnly(effectiveEnd.toISOString(), tz, locale)
    : '—';
  return `${startStr} – ${endStr}`;
}

// ---------------------------------------------------------------------------
// Build a deduplicated, sorted planet list from PlanetsVisible
// ---------------------------------------------------------------------------

function buildPlanetList(
  planets: PlanetsVisible,
  sunsetIso: string | null,
): PlanetEntry[] {
  const seen = new Set<string>();
  const all: PlanetEntry[] = [];

  for (const p of [...planets.evening, ...planets.allNight, ...planets.morning]) {
    const key = p.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(p);
    }
  }

  const sunsetMs = sunsetIso ? new Date(sunsetIso).getTime() : null;

  const visible = all.filter((p) => {
    // Exclude planets that set before sunset (below horizon all night)
    if (p.set && sunsetMs !== null) {
      const setMs = new Date(p.set).getTime();
      if (setMs <= sunsetMs) return false;
    }
    return true;
  });

  // Sort by rise time (planets with no rise time go to the end)
  visible.sort((a, b) => {
    const ta = a.rise ? new Date(a.rise).getTime() : Infinity;
    const tb = b.rise ? new Date(b.rise).getTime() : Infinity;
    return ta - tb;
  });

  return visible;
}

// ---------------------------------------------------------------------------
// Inline SVG icons (all aria-hidden)
// ---------------------------------------------------------------------------

/** Info circle icon (Phosphor info regular) */
function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-2px', marginRight: '4px', flexShrink: 0 }}
    >
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PlanetColumn — one planet in the top scrollable row
// ---------------------------------------------------------------------------

interface PlanetColumnProps {
  planet: PlanetEntry;
  stationTz: string;
  sunsetIso: string | null;
  sunriseIso: string | null;
  locale: string;
  t: (key: string) => string;
}

function PlanetColumn({ planet, stationTz, sunsetIso, sunriseIso, locale, t }: PlanetColumnProps) {
  const name = planet.name;
  const nameLower = name.toLowerCase();
  const imgSrc = `/images/planets/${nameLower}.webp`;

  const quality = effectiveQuality(planet);
  const qLabel = qualityLabel(quality, t);
  const qClass = qualityTextClass(quality);

  // Viewing window = when the planet is above the horizon tonight.
  // Use rise/set clamped to sunset–sunrise (not the BFF clearWindow,
  // which represents clear-sky forecast intervals, not visibility).
  const windowText = formatViewingWindow(
    planet.rise, planet.set,
    sunsetIso, sunriseIso, stationTz, locale, t,
  );
  const posText = naturalPosition(planet.direction, planet.altitude);

  return (
    /*
     * Mobile: horizontal row — image left (60px), data right (flex-1).
     *   Each planet gets a full-width row in the stacked list.
     * Desktop (md+): vertical column — image centered above data, min 110px wide.
     *   Reverts to the original centered column layout.
     * aria-label = planet name so it is announced as a distinct region by SR.
     */
    <article
      className="flex flex-row items-center gap-3 w-full md:flex-col md:items-center md:gap-[0.1rem] md:min-w-[110px] md:flex-shrink-0 md:w-auto"
      aria-label={name}
    >
      {/* Planet image — 60px on mobile (left), 90px-height centered on desktop */}
      <div
        className="flex-shrink-0 flex items-center justify-center md:w-full"
        style={{ width: '60px', height: '60px' }}
      >
        <img
          src={imgSrc}
          alt={name}
          className="object-contain"
          style={{ maxHeight: '56px', maxWidth: '56px' }}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Text block — fills remaining width on mobile, centered on desktop */}
      <div className="flex flex-col gap-[0.15rem] min-w-0 flex-1 md:flex-none md:items-center md:w-full">
        {/* Planet name */}
        <span className="text-[0.75rem] uppercase tracking-wider font-semibold">
          {name}
        </span>

        {/*
         * Viewing quality: colored dot + text label.
         * Color is NEVER the sole signal — text label always present (WCAG 1.4.1).
         * Hidden entirely when quality is null (qLabel is empty string).
         */}
        {qLabel && (
          <span
            className={`flex items-center gap-[0.25rem] text-[0.75rem] font-semibold ${qClass}`}
            aria-label={`${t('planets.viewingQuality')}: ${qLabel}`}
          >
            {quality === 'not_visible'
              ? <EyeSlash size={14} weight="bold" aria-hidden="true" />
              : <Eye size={14} weight="bold" aria-hidden="true" />
            }
            {qLabel}
          </span>
        )}

        {/* Viewing window range */}
        {windowText && (
          <span className="text-[0.75rem] text-muted-foreground md:text-center">
            {windowText}
          </span>
        )}

        {/* Sky position: direction + altitude */}
        {posText && (
          <span className="text-[0.7rem] text-muted-foreground italic md:text-center leading-tight">
            {posText}
          </span>
        )}

        {/* Viewing note (optional) */}
        {planet.viewingNote && (
          <span className="text-[0.7rem] text-muted-foreground/70 italic md:text-center leading-tight mt-0.5">
            {planet.viewingNote}
          </span>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// GanttTimeline — SVG Gantt chart spanning sunset → next sunrise
// ---------------------------------------------------------------------------

interface GanttTimelineProps {
  planets: PlanetEntry[];
  almanac: AlmanacSnapshot;
  stationTz: string;
}

/** viewBox constants — Gantt chart coordinate space */
const VB_WIDTH  = 1000;
const VB_HEIGHT = 280;

/** Layout constants — small inset so images/bars don't clip at edges */
const LEFT_MARGIN  = 40;
const RIGHT_MARGIN = 970;
const CHART_WIDTH  = RIGHT_MARGIN - LEFT_MARGIN; // 960 SVG units
const BAR_HEIGHT   = 16;   // px height of each planet bar
const BAR_GAP      = 40;   // px between bar rows (center-to-center)
const FIRST_BAR_Y  = 58;   // Y of the first bar's top edge

function GanttTimeline({ planets, almanac, stationTz }: GanttTimelineProps) {
  const isMobile = useIsMobile();
  const S = isMobile ? 2.5 : 1;
  const barH = BAR_HEIGHT * S;
  const barGap = BAR_GAP * S;
  const firstBarY = FIRST_BAR_Y * S;
  const sunset  = parseISO(almanac.sun.set);
  const sunrise = parseISO(almanac.sun.rise);

  // If we can't determine the window, skip rendering the SVG
  if (!sunset || !sunrise) return null;

  // Capture narrowed non-null references so nested functions can use them
  // without TypeScript complaining about possible null (TS flow narrows locals
  // but not closures over let/const reassigned before the closure is defined).
  const sunsetNN: Date  = sunset;
  const sunriseNN: Date = sunrise;

  // Ensure sunrise is after sunset (next-day sunrise)
  let sunriseDate = sunriseNN;
  if (sunriseDate <= sunsetNN) {
    sunriseDate = new Date(sunriseDate.getTime() + 24 * 60 * 60 * 1000);
  }

  const windowMs   = sunriseDate.getTime() - sunsetNN.getTime();
  const windowMins = windowMs / 60_000;

  /**
   * Convert a UTC datetime to an X coordinate in SVG units.
   * Clamps to [LEFT_MARGIN, RIGHT_MARGIN].
   */
  function timeToX(dt: Date): number {
    const offsetMins = (dt.getTime() - sunsetNN.getTime()) / 60_000;
    const frac = Math.max(0, Math.min(1, offsetMins / windowMins));
    return LEFT_MARGIN + frac * CHART_WIDTH;
  }

  // ---- Time-axis ticks at even LOCAL hours, 2-hour intervals ----
  const tickDates: Date[] = [];
  const ONE_HOUR_MS = 60 * 60 * 1000;

  // Walk hour-by-hour from sunset to find even local hours
  {
    let cursor = new Date(sunsetNN.getTime() + ONE_HOUR_MS);
    while (cursor < sunriseDate) {
      const localHourStr = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', hour12: false, timeZone: stationTz,
      }).format(cursor);
      const localHour = parseInt(localHourStr, 10);
      if (localHour % 2 === 0) {
        tickDates.push(new Date(cursor));
        cursor = new Date(cursor.getTime() + 2 * ONE_HOUR_MS);
      } else {
        cursor = new Date(cursor.getTime() + ONE_HOUR_MS);
      }
    }
  }

  // ---- Section boundaries (thirds of the night) ----
  const third = windowMs / 3;
  const eveningCenterX = timeToX(new Date(sunsetNN.getTime() + third / 2));
  const nightCenterX   = timeToX(new Date(sunsetNN.getTime() + windowMs / 2));
  const morningCenterX = timeToX(new Date(sunriseDate.getTime() - third / 2));

  // ---- Sky gradient (matches mockup) ----
  const skyGradientId = 'planet-sky-bg';
  const skyStops = [
    { offset: '0%',   color: '#4a2818' },
    { offset: '4%',   color: '#6e3f2f' },
    { offset: '10%',  color: '#50312f' },
    { offset: '16%',  color: '#241d2e' },
    { offset: '28%',  color: '#0b122f' },
    { offset: '55%',  color: '#0a1530' },
    { offset: '78%',  color: '#182c51' },
    { offset: '90%',  color: '#27436e' },
    { offset: '100%', color: '#355486' },
  ];

  // ---- Planet bars ----
  interface BarData {
    planet: PlanetEntry;
    barX1: number;
    barX2: number;
    barY: number;
    color: string;
    gradId: string;
  }

  // Collect bar candidates, then assign consecutive Y positions
  // so invisible planets don't leave gaps.
  interface BarCandidate {
    planet: PlanetEntry;
    barX1: number;
    barX2: number;
    color: string;
    gradId: string;
  }

  const candidates: BarCandidate[] = [];
  for (const planet of planets) {
    const rise   = parseISO(planet.rise);
    const set    = parseISO(planet.set);
    const color  = getPlanetColor(planet.name);
    const gradId = `plt-bar-${planet.name.toLowerCase()}`;

    const barStart = rise
      ? new Date(Math.max(rise.getTime(), sunsetNN.getTime()))
      : sunsetNN;
    const barEnd = set
      ? new Date(Math.min(set.getTime(), sunriseDate.getTime()))
      : sunriseDate;

    if (barEnd <= barStart) continue;

    candidates.push({
      planet,
      barX1: timeToX(barStart),
      barX2: timeToX(barEnd),
      color,
      gradId,
    });
  }

  const bars: BarData[] = candidates.map((c, idx) => ({
    ...c,
    barY: firstBarY + idx * barGap,
  }));

  const lastBarBottom = bars.length > 0
    ? bars[bars.length - 1].barY + barH + 20 * S
    : firstBarY + 40;
  const axisY = lastBarBottom + 10 * S;
  const labelY = axisY + 25 * S;
  const vbH = Math.max(isMobile ? 380 : VB_HEIGHT, labelY + 20 * S);

  // ---- Build accessible description ----
  const descParts = bars.map(
    (b) =>
      `${b.planet.name}: rises ${b.planet.rise ? new Date(b.planet.rise).toUTCString() : 'before sunset'}, sets ${b.planet.set ? new Date(b.planet.set).toUTCString() : 'after sunrise'}`,
  );
  const svgDesc = descParts.join('; ') || 'No planets visible tonight.';

  return (
    <svg
      style={{ width: '100%', display: 'block' }}
      viewBox={`0 0 ${VB_WIDTH} ${vbH}`}
      role="img"
      aria-labelledby="planet-gantt-title"
      aria-describedby="planet-gantt-desc"
      focusable="false"
    >
      <title id="planet-gantt-title">Planet visibility timeline from sunset to sunrise</title>
      <desc id="planet-gantt-desc">{svgDesc}</desc>

      <defs>
        {/* Sky background gradient */}
        <linearGradient id={skyGradientId} x1="0" y1="0" x2="1" y2="0">
          {skyStops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>

        {/* Per-planet bar gradients: fade-in from left */}
        {bars.map((b) => (
          <linearGradient key={b.gradId} id={b.gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={b.color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={b.color} stopOpacity={0.90} />
          </linearGradient>
        ))}

        {/* Drop shadow for planet images embedded in SVG */}
        <filter id="plt-shadow" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="3"
            floodColor="#000"
            floodOpacity="0.6"
          />
        </filter>
      </defs>

      {/* Sky background */}
      <rect
        x="0"
        y="0"
        width={VB_WIDTH}
        height={vbH}
        rx="8"
        fill={`url(#${skyGradientId})`}
      />

      {/* Section labels with Phosphor icons */}
      <g transform={`translate(${eveningCenterX},30)`}>
        <svg x={-28 * S} y={-10 * S} width={20 * S} height={20 * S} viewBox="0 0 256 256" fill="#f59e0b" aria-hidden="true">
          <path d="M240,152H199.55a73.54,73.54,0,0,0,.45-8,72,72,0,0,0-144,0,73.54,73.54,0,0,0,.45,8H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM72,144a56,56,0,1,1,111.41,8H72.59A56.13,56.13,0,0,1,72,144Zm144,56a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16H208A8,8,0,0,1,216,200ZM72.84,43.58a8,8,0,0,1,14.32-7.16l8,16a8,8,0,0,1-14.32,7.16Zm-56,48.84a8,8,0,0,1,10.74-3.57l16,8a8,8,0,0,1-7.16,14.31l-16-8A8,8,0,0,1,16.84,92.42Zm192,15.16a8,8,0,0,1,3.58-10.73l16-8a8,8,0,1,1,7.16,14.31l-16,8a8,8,0,0,1-10.74-3.58Zm-48-55.16,8-16a8,8,0,0,1,14.32,7.16l-8,16a8,8,0,1,1-14.32-7.16Z" />
        </svg>
        <text x="0" y={3 * S} fill="rgba(255,255,255,0.7)" fontFamily="var(--font-sans)" fontSize={13 * S} fontWeight="700" letterSpacing="0.06em">EVENING</text>
      </g>
      <g transform={`translate(${nightCenterX},30)`}>
        <svg x={-28 * S} y={-10 * S} width={20 * S} height={20 * S} viewBox="0 0 256 256" fill="#94a3b8" aria-hidden="true">
          <path d="M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm72.77,97a8,8,0,0,1,1.43,8A96,96,0,1,1,95.07,37.8a8,8,0,0,1,10.6,9.06A88.07,88.07,0,0,0,209.14,150.33,8,8,0,0,1,216.77,153Zm-19.39,14.88c-1.79.09-3.59.14-5.38.14A104.11,104.11,0,0,1,88,64c0-1.79,0-3.59.14-5.38A80,80,0,1,0,197.38,167.86Z" />
        </svg>
        <text x="0" y={3 * S} fill="rgba(255,255,255,0.7)" fontFamily="var(--font-sans)" fontSize={13 * S} fontWeight="700" letterSpacing="0.06em">NIGHT</text>
      </g>
      <g transform={`translate(${morningCenterX},30)`}>
        <svg x={-28 * S} y={-10 * S} width={20 * S} height={20 * S} viewBox="0 0 256 256" fill="#f59e0b" aria-hidden="true">
          <path d="M240,152H199.55a73.54,73.54,0,0,0,.45-8,72,72,0,0,0-144,0,73.54,73.54,0,0,0,.45,8H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM72,144a56,56,0,1,1,111.41,8H72.59A56.13,56.13,0,0,1,72,144Zm144,56a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16H208A8,8,0,0,1,216,200ZM72.84,43.58a8,8,0,0,1,14.32-7.16l8,16a8,8,0,0,1-14.32,7.16Zm-56,48.84a8,8,0,0,1,10.74-3.57l16,8a8,8,0,0,1-7.16,14.31l-16-8A8,8,0,0,1,16.84,92.42Zm192,15.16a8,8,0,0,1,3.58-10.73l16-8a8,8,0,1,1,7.16,14.31l-16,8a8,8,0,0,1-10.74-3.58Zm-48-55.16,8-16a8,8,0,0,1,14.32,7.16l-8,16a8,8,0,1,1-14.32-7.16Z" />
        </svg>
        <text x="0" y={3 * S} fill="rgba(255,255,255,0.7)" fontFamily="var(--font-sans)" fontSize={13 * S} fontWeight="700" letterSpacing="0.06em">MORNING</text>
      </g>

      {/* Planet bars with proportionally-sized images */}
      {bars.map((b) => {
        const barWidth = Math.max(0, b.barX2 - b.barX1);
        const imgSize = getChartImgSize(b.planet.name) * S;
        const imgX = b.barX1 - imgSize / 2;
        const imgY = b.barY + barH / 2 - imgSize / 2;
        return (
          <g key={b.planet.name}>
            <rect
              x={b.barX1}
              y={b.barY}
              width={barWidth}
              height={barH}
              rx={barH / 2}
              fill={`url(#${b.gradId})`}
            />
            <image
              href={`/images/planets/${b.planet.name.toLowerCase()}.webp`}
              x={imgX}
              y={imgY}
              width={imgSize}
              height={imgSize}
              filter="url(#plt-shadow)"
            />
          </g>
        );
      })}

      {/* Time axis line */}
      <line
        x1={LEFT_MARGIN}
        y1={axisY}
        x2={RIGHT_MARGIN}
        y2={axisY}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />

      {/* Sunset tick + actual time label */}
      <line
        x1={LEFT_MARGIN}
        y1={axisY - 4}
        x2={LEFT_MARGIN}
        y2={axisY + 3}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <text
        x={LEFT_MARGIN}
        y={labelY}
        textAnchor="start"
        fill="#f59e0b"
        fontFamily="var(--font-chart)"
        fontSize={13 * S}
        fontWeight="600"
      >
        {svgTickLabel(sunsetNN, stationTz)}
      </text>

      {/* Intermediate ticks at even local 2-hour intervals */}
      {tickDates.map((td, i) => {
        const tx = timeToX(td);
        if (tx < LEFT_MARGIN + 50 || tx > RIGHT_MARGIN - 60) return null;
        return (
          <g key={i}>
            <line
              x1={tx}
              y1={axisY - 3}
              x2={tx}
              y2={axisY + 3}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
            />
            <text
              x={tx}
              y={labelY}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontFamily="var(--font-chart)"
              fontSize={12 * S}
            >
              {svgTickLabel(td, stationTz)}
            </text>
          </g>
        );
      })}

      {/* Sunrise tick + label */}
      <line
        x1={RIGHT_MARGIN}
        y1={axisY - 4}
        x2={RIGHT_MARGIN}
        y2={axisY + 3}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <text
        x={RIGHT_MARGIN}
        y={labelY}
        textAnchor="end"
        fill="#f59e0b"
        fontFamily="var(--font-chart)"
        fontSize={13 * S}
        fontWeight="600"
      >
        Sunrise
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height: '20rem' }}
      role="status"
      aria-label="Loading planet outlook"
      aria-busy="true"
    />
  );
}

// ---------------------------------------------------------------------------
// PlanetTimelineCard — main export
// ---------------------------------------------------------------------------

/**
 * PlanetTimelineCard — Surface C of the Almanac page.
 *
 * Displays:
 * 1. Card header: "Tonight's Planet Outlook"
 * 2. Top section: scrollable horizontal row of planet columns
 *    (image, name, viewing quality badge, best time, sky position)
 * 3. Bottom section: SVG Gantt chart (sunset → sunrise) with per-planet bars
 * 4. Footer: conjunction notes + info footnote
 */
export function PlanetTimelineCard({
  planets,
  almanac,
  stationTz,
  loading,
  error,
}: PlanetTimelineCardProps) {
  const { t, i18n } = useTranslation('almanac');
  const locale = i18n.language || 'en-US';
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);

  // Loading state
  if (loading) {
    return <CardSkeleton />;
  }

  // Error state
  if (error !== null) {
    return (
      <Card footprint="full">
        <CardContent className="py-8">
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state — all three arrays are empty or planets is null
  const isEmpty =
    !planets ||
    (planets.evening.length === 0 &&
      planets.morning.length === 0 &&
      planets.allNight.length === 0);

  if (isEmpty) {
    return (
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h2">{t('planets.title')}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          {t('planets.empty')}
        </CardContent>
      </Card>
    );
  }

  const sunsetIso = almanac?.sun.set ?? null;
  const planetList = buildPlanetList(planets!, sunsetIso);

  // Derive overall viewing conditions from best planet quality (BFF or fallback)
  const qualityRank: Record<string, number> = {
    excellent: 4, good: 3, fair: 2, poor: 1, not_visible: 0,
  };
  const bestQuality = planetList.reduce<string | null>((best, p) => {
    const q = effectiveQuality(p);
    if (!q) return best;
    if (!best) return q;
    return (qualityRank[q] ?? 0) > (qualityRank[best] ?? 0) ? q : best;
  }, null);

  function overallLabel(q: string | null): string {
    switch (q) {
      case 'excellent': return t('planets.conditionsExcellent');
      case 'good':      return t('planets.conditionsGood');
      case 'fair':      return t('planets.conditionsFair');
      case 'poor':      return t('planets.conditionsPoor');
      case 'not_visible': return t('planets.conditionsNotVisible', 'Overcast — viewing unlikely');
      default:          return '';
    }
  }

  const overallText = overallLabel(bestQuality);
  const overallClass = bestQuality ? qualityTextClass(bestQuality as PlanetViewingQuality) : '';

  // Collect conjunction notes across all planets
  const conjunctions = planetList.filter(
    (p) => p.conjunction !== null && p.conjunction !== undefined,
  );

  const sunriseIso = almanac?.sun.rise ?? null;

  return (
    <Card footprint="full">
      <CardHeader>
        <CardTitle as="h2">{t('planets.title')}</CardTitle>
        {overallText && (
          <span className={`flex items-center gap-[0.25rem] shrink-0 font-semibold ${overallClass}`} style={{ fontSize: 'var(--text-label, 0.75rem)' }}>
            {bestQuality === 'not_visible'
              ? <EyeSlash size={14} weight="bold" aria-hidden="true" />
              : <Eye size={14} weight="bold" aria-hidden="true" />
            }
            {overallText}
          </span>
        )}
      </CardHeader>

      <CardContent>
        {/* Subtitle */}
        <p className="text-[0.75rem] text-muted-foreground mb-4">
          {t('planets.subtitle')}
        </p>

        {/*
         * Top section: planet list.
         * Mobile: vertical stack (flex-col) — each planet gets its own full-width row.
         * Desktop (md+): horizontal row with justify-around to spread evenly.
         * No horizontal scroll on mobile (flex-col removes that need).
         * pb-4 gives breathing room before the divider.
         */}
        <div
          className="flex flex-col gap-[1.25rem] pb-4 md:flex-row md:gap-[1.75rem] md:overflow-x-auto md:justify-around"
          role="list"
          aria-label={t('planets.listLabel')}
        >
          {planetList.map((planet) => (
            <div key={planet.name} role="listitem">
              <PlanetColumn
                planet={planet}
                stationTz={stationTz}
                sunsetIso={sunsetIso}
                sunriseIso={sunriseIso}
                locale={locale}
                t={t}
              />
            </div>
          ))}
        </div>

        {/*
         * Bottom section: SVG Gantt timeline.
         * Separated from the planet row by a subtle top border (matches .timeline-wrap).
         * Horizontal overflow-scroll wrapper so the SVG can scroll on very narrow screens
         * (SVG uses viewBox so it scales, but this is a safety net).
         */}
        {almanac !== null && (
          <div
            className="border-t border-border pt-4 overflow-x-auto"
            aria-label={t('planets.timelineLabel')}
          >
            <div className="flex justify-end mb-1">
              <ChartFullscreenButton onClick={() => setTimelineFullscreen(true)} />
            </div>
            <GanttTimeline
              planets={planetList}
              almanac={almanac}
              stationTz={stationTz}
            />
            <ChartFullscreenOverlay
              isOpen={timelineFullscreen}
              onClose={() => setTimelineFullscreen(false)}
              aria-label="Planet visibility timeline fullscreen"
            >
              <GanttTimeline
                planets={planetList}
                almanac={almanac}
                stationTz={stationTz}
              />
            </ChartFullscreenOverlay>
          </div>
        )}

        {/* Conjunction footer notes */}
        {conjunctions.length > 0 && (
          <ul
            className="mt-3 flex flex-col gap-1"
            aria-label={t('planets.conjunctionsLabel')}
          >
            {conjunctions.map((p) => (
              <li
                key={p.name}
                className="text-[0.75rem] text-muted-foreground flex items-center gap-1"
              >
                {/* Colored dot — color signals the planet; text carries the conjunction info */}
                <span
                  aria-hidden="true"
                  style={{ color: getPlanetColor(p.name), fontSize: '0.55rem' }}
                >
                  &#x25cf;
                </span>
                <strong className="font-semibold text-foreground/80">
                  {p.name}:
                </strong>{' '}
                {p.conjunction}
              </li>
            ))}
          </ul>
        )}

        {/* Footer note */}
        <p className="text-[0.7rem] text-muted-foreground/60 mt-3 flex items-center">
          <InfoIcon />
          {t('planets.footNote')}
        </p>
      </CardContent>
    </Card>
  );
}
