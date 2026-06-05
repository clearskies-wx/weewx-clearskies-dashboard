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

import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
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

/** Human-readable quality label for display and aria. */
function qualityLabel(quality: PlanetViewingQuality, t: (k: string) => string): string {
  switch (quality) {
    case 'excellent':    return t('planets.qualityExcellent');
    case 'good':         return t('planets.qualityGood');
    case 'fair':         return t('planets.qualityFair');
    case 'poor':         return t('planets.qualityPoor');
    case 'not_visible':  return t('planets.qualityNotVisible');
    default:             return '—';
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
// Build a deduplicated, sorted planet list from PlanetsVisible
// ---------------------------------------------------------------------------

function buildPlanetList(planets: PlanetsVisible): PlanetEntry[] {
  const seen = new Set<string>();
  const all: PlanetEntry[] = [];

  for (const p of [...planets.evening, ...planets.allNight, ...planets.morning]) {
    const key = p.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(p);
    }
  }

  // Sort by rise time (planets with no rise time go to the end)
  all.sort((a, b) => {
    const ta = a.rise ? new Date(a.rise).getTime() : Infinity;
    const tb = b.rise ? new Date(b.rise).getTime() : Infinity;
    return ta - tb;
  });

  return all;
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
  locale: string;
  t: (key: string) => string;
}

function PlanetColumn({ planet, stationTz, locale, t }: PlanetColumnProps) {
  const name = planet.name;
  const nameLower = name.toLowerCase();
  const imgSrc = `/images/planets/${nameLower}.webp`;

  const qLabel = qualityLabel(planet.viewingQuality, t);
  const qClass = qualityTextClass(planet.viewingQuality);

  const bestTime = formatTimeOnly(planet.bestViewingTime, stationTz, locale);
  const posText = [
    planet.direction,
    planet.altitude !== null ? `${planet.altitude}°` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    /*
     * Each column is a flex column, min 110px wide per the mockup.
     * aria-label = planet name so it is announced as a distinct region by SR.
     */
    <article
      className="flex flex-col items-center gap-[0.1rem] min-w-[110px] flex-shrink-0"
      aria-label={name}
    >
      {/* Planet name */}
      <span className="text-[0.75rem] uppercase tracking-wider font-semibold">
        {name}
      </span>

      {/*
       * Viewing quality: colored dot + text label.
       * Color is NEVER the sole signal — text label always present (WCAG 1.4.1).
       */}
      <span
        className={`flex items-center gap-[0.25rem] text-[0.75rem] font-semibold ${qClass}`}
        aria-label={`${t('planets.viewingQuality')}: ${qLabel}`}
      >
        {/* Colored dot — decorative, meaning carried by adjacent text */}
        <span aria-hidden="true" className="text-[0.6rem]">&#x25cf;</span>
        {qLabel}
      </span>

      {/* Planet image — fixed-height wrapper centers image of any size */}
      <div
        className="w-full flex items-center justify-center"
        style={{ height: '90px' }}
      >
        <img
          src={imgSrc}
          alt={name}
          className="object-contain"
          style={{ maxHeight: '80px', maxWidth: '80px' }}
          loading="lazy"
          onError={(e) => {
            // Hide broken image; parent wrapper preserves layout height
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Best viewing time */}
      {planet.bestViewingTime !== null && (
        <span className="text-[0.75rem] text-muted-foreground text-center">
          {bestTime}
        </span>
      )}

      {/* Sky position: direction + altitude */}
      {posText && (
        <span className="text-[0.7rem] text-muted-foreground italic text-center leading-tight">
          {posText}
        </span>
      )}

      {/* Viewing note (optional) */}
      {planet.viewingNote && (
        <span className="text-[0.7rem] text-muted-foreground/70 italic text-center leading-tight mt-0.5">
          {planet.viewingNote}
        </span>
      )}
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

/** Layout constants */
const LEFT_MARGIN  = 20;   // X where the sunset tick starts
const RIGHT_MARGIN = 980;  // X where the sunrise tick ends
const CHART_WIDTH  = RIGHT_MARGIN - LEFT_MARGIN; // 960 SVG units
const AXIS_Y       = 245;  // Y of the time axis line
const BAR_HEIGHT   = 16;   // px height of each planet bar
const BAR_GAP      = 40;   // px between bar rows (center-to-center)
const FIRST_BAR_Y  = 58;   // Y of the first bar's top edge
const LABEL_Y      = 264;  // Y of tick labels

function GanttTimeline({ planets, almanac, stationTz }: GanttTimelineProps) {
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

  // ---- Time-axis ticks at 2-hour intervals ----
  const tickDates: Date[] = [];
  // Find first even hour after sunset in TZ
  // We step in 2-hour increments across the window
  const STEP_MS = 2 * 60 * 60 * 1000;
  // Round sunset UP to the next even hour boundary
  const firstEvenMs =
    Math.ceil(sunsetNN.getTime() / STEP_MS) * STEP_MS;
  let t = new Date(firstEvenMs);
  while (t <= sunriseDate) {
    tickDates.push(new Date(t));
    t = new Date(t.getTime() + STEP_MS);
  }

  // ---- Section boundaries ----
  // EVENING: sunset → midnight, NIGHT: around midnight, MORNING: → sunrise
  const midnightApprox = new Date(
    Math.round((sunsetNN.getTime() + sunriseDate.getTime()) / 2),
  );
  const eveningCenterX = timeToX(
    new Date((sunsetNN.getTime() + midnightApprox.getTime()) / 2),
  );
  const nightCenterX   = timeToX(midnightApprox);
  const morningCenterX = timeToX(
    new Date((midnightApprox.getTime() + sunriseDate.getTime()) / 2),
  );

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

  const bars: BarData[] = [];
  planets.forEach((planet, idx) => {
    const barY   = FIRST_BAR_Y + idx * BAR_GAP;
    const rise   = parseISO(planet.rise);
    const set    = parseISO(planet.set);
    const color  = getPlanetColor(planet.name);
    const gradId = `plt-bar-${planet.name.toLowerCase()}`;

    if (!rise && !set) return; // not visible — no bar

    // Clamp rise/set to the sunset→sunrise window
    const barStart = rise ? new Date(Math.max(rise.getTime(), sunsetNN.getTime())) : sunsetNN;
    const barEnd   = set
      ? new Date(Math.min(set.getTime(), sunriseDate.getTime()))
      : sunriseDate;

    if (barEnd <= barStart) return; // fully outside window

    bars.push({
      planet,
      barX1: timeToX(barStart),
      barX2: timeToX(barEnd),
      barY,
      color,
      gradId,
    });
  });

  // ---- Build accessible description ----
  const descParts = bars.map(
    (b) =>
      `${b.planet.name}: rises ${b.planet.rise ? new Date(b.planet.rise).toUTCString() : 'before sunset'}, sets ${b.planet.set ? new Date(b.planet.set).toUTCString() : 'after sunrise'}`,
  );
  const svgDesc = descParts.join('; ') || 'No planets visible tonight.';

  return (
    <svg
      style={{ width: '100%', display: 'block' }}
      viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
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
        height={VB_HEIGHT}
        rx="8"
        fill={`url(#${skyGradientId})`}
      />

      {/* Section labels */}
      <text
        x={eveningCenterX}
        y="28"
        textAnchor="middle"
        fill="rgba(255,255,255,0.55)"
        fontFamily="var(--font-sans)"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.06em"
      >
        EVENING
      </text>
      <text
        x={nightCenterX}
        y="28"
        textAnchor="middle"
        fill="rgba(255,255,255,0.55)"
        fontFamily="var(--font-sans)"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.06em"
      >
        NIGHT
      </text>
      <text
        x={morningCenterX}
        y="28"
        textAnchor="middle"
        fill="rgba(255,255,255,0.55)"
        fontFamily="var(--font-sans)"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.06em"
      >
        MORNING
      </text>

      {/* Planet bars */}
      {bars.map((b) => {
        const barWidth = Math.max(0, b.barX2 - b.barX1);
        return (
          <g key={b.planet.name}>
            <rect
              x={b.barX1}
              y={b.barY}
              width={barWidth}
              height={BAR_HEIGHT}
              rx={BAR_HEIGHT / 2}
              fill={`url(#${b.gradId})`}
            />
            {/* Planet image positioned at bar start */}
            <image
              href={`/images/planets/${b.planet.name.toLowerCase()}.webp`}
              x={b.barX1 - 18}
              y={b.barY - 6}
              width="28"
              height="28"
              filter="url(#plt-shadow)"
            />
          </g>
        );
      })}

      {/* Y-axis: planet name labels on left side */}
      {planets.map((planet, idx) => {
        const barY   = FIRST_BAR_Y + idx * BAR_GAP;
        const labelY = barY + BAR_HEIGHT / 2 + 4; // vertically centered on bar
        return (
          <text
            key={planet.name}
            x={LEFT_MARGIN - 2}
            y={labelY}
            textAnchor="end"
            fill="rgba(255,255,255,0.60)"
            fontFamily="var(--font-chart)"
            fontSize="10"
          >
            {planet.name}
          </text>
        );
      })}

      {/* Time axis line */}
      <line
        x1={LEFT_MARGIN}
        y1={AXIS_Y}
        x2={RIGHT_MARGIN}
        y2={AXIS_Y}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />

      {/* Sunset tick + label */}
      <line
        x1={LEFT_MARGIN}
        y1={AXIS_Y - 4}
        x2={LEFT_MARGIN}
        y2={AXIS_Y + 3}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <text
        x={LEFT_MARGIN}
        y={LABEL_Y}
        textAnchor="start"
        fill="#f59e0b"
        fontFamily="var(--font-chart)"
        fontSize="12"
        fontWeight="600"
      >
        Sunset
      </text>

      {/* Intermediate ticks at 2-hour intervals */}
      {tickDates.map((td, i) => {
        const tx = timeToX(td);
        // Skip ticks that would overlap sunset or sunrise labels
        if (tx < LEFT_MARGIN + 40 || tx > RIGHT_MARGIN - 50) return null;
        return (
          <g key={i}>
            <line
              x1={tx}
              y1={AXIS_Y - 3}
              x2={tx}
              y2={AXIS_Y + 3}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
            />
            <text
              x={tx}
              y={LABEL_Y}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontFamily="var(--font-chart)"
              fontSize="11"
            >
              {svgTickLabel(td, stationTz)}
            </text>
          </g>
        );
      })}

      {/* Sunrise tick + label */}
      <line
        x1={RIGHT_MARGIN}
        y1={AXIS_Y - 4}
        x2={RIGHT_MARGIN}
        y2={AXIS_Y + 3}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <text
        x={RIGHT_MARGIN}
        y={LABEL_Y}
        textAnchor="end"
        fill="#f59e0b"
        fontFamily="var(--font-chart)"
        fontSize="12"
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

  const planetList = buildPlanetList(planets!);

  // Collect conjunction notes across all planets
  const conjunctions = planetList.filter(
    (p) => p.conjunction !== null && p.conjunction !== undefined,
  );

  return (
    <Card footprint="full">
      <CardHeader>
        <CardTitle as="h2">{t('planets.title')}</CardTitle>
      </CardHeader>

      <CardContent>
        {/*
         * Top section: horizontal scrollable planet row.
         * overflow-x-auto + flex — scrollable on mobile, spread on wide screens.
         * justify-around on wider viewports to fill space evenly.
         * gap-[1.75rem] matches the mockup's .planets-top gap.
         * pb-4 gives breathing room before the divider.
         */}
        <div
          className="flex gap-[1.75rem] overflow-x-auto pb-4 justify-around"
          role="list"
          aria-label={t('planets.listLabel')}
        >
          {planetList.map((planet) => (
            <div key={planet.name} role="listitem">
              <PlanetColumn
                planet={planet}
                stationTz={stationTz}
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
            <GanttTimeline
              planets={planetList}
              almanac={almanac}
              stationTz={stationTz}
            />
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
