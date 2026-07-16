// FishingTab.tsx — Fishing activity tab content (DASHBOARD-MANUAL §12, T8.2
// F23 redesign, MARINE-FIXIT-PLAN T6.1/T6.2 restructure). Surfaces the
// fishing scoring system (enrichment/fishing_scorer.py) via a score card
// (headline + score + merged scoring breakdown), a separate current-
// conditions stat card, the 3-day forecast period grid with a per-period
// species accordion, a solunar calendar matching the Almanac page's
// SunMoonDetailCard visual quality, a standalone species forecast table,
// and the standalone tide chart. All sections use the shared
// Card/CardHeader/CardTitle/CardContent system and the shared
// MarineStatTile — no local Panel/StatTile functions (DESIGN-MANUAL §20).
//
// Panel order (top to bottom) — T6.1/T6.2 restructure:
//   1. Alerts (AlertsPanel, shared, unchanged)
//   2. Score (`Card footprint="wide"`) — conditionsText headline, overall
//      score (0-100) badge + qualitative label, THEN the 4 weighted scoring
//      factor bars merged directly below (Pressure 37.5%, Tide 31.25%,
//      Solunar 18.75%, Time of Day 12.5% — the exact weights
//      fishing_scorer.py uses: _WEIGHT_PRESSURE/_WEIGHT_TIDE/
//      _WEIGHT_SOLUNAR/_WEIGHT_TIME_OF_DAY). Tap/click a bar to reveal
//      explanation text. waterTempScore is intentionally NOT shown here —
//      it is scored purely per-species server-side (fishing_scorer.py
//      comment, 2026-07-11), not part of the shared weighted base score, so
//      it has no place in a *shared* factor breakdown. It has no raw-value
//      counterpart either (FishingForecast carries no waterTemp field, only
//      *Score fields).
//   3. Current Conditions (`Card footprint="wide"`) — stat grid pulled out
//      of the score card so the score card stays focused on the score
//      itself: pressure + trend, wind speed, wind gust, wind direction
//      (cardinal), water temp, air temp, tide state. All values come from
//      `useMarineDetail`'s live `observation` (see Data sources below) —
//      NOT from the fishing-forecast period — so this card reads as "right
//      now" rather than "this 4-hour window's forecast inputs".
//   4. Forecast Periods (`Card footprint="full"`) — 3-day period grid as a
//      semantic table (day rows × period columns). Each period cell is now
//      a real `<button type="button">` (T6.2) — clicking one expands a
//      per-period species accordion rendered below the grid, inside the
//      same card, showing that period's `speciesScores` (name/score/status
//      badge, same tier coloring as the standalone Species Forecast table).
//      `HorizontalScrollNav` still wraps the table for narrow viewports.
//   5. Solunar Calendar (`Card footprint="full"`) — MoonPhaseIcon/MoonPhaseG
//      (same components as the Almanac page), a moonrise→moonset arc with
//      major/minor period windows highlighted (SunMoonDetailCard geometry,
//      simplified to a single arc), and a horizontal timeline strip across
//      the full day with a "now" indicator.
//   6. Species Forecast (`Card footprint="full"`) — standalone summary
//      table: Species / Score / Status (+ Notes when the API supplies a
//      `note`), for the CURRENT period only. Status text and color tier
//      both trace back to the API's `status`/`score` fields
//      (fishing_scorer.py _score_one_species) — status is ALREADY
//      locale-translated server-side (i18n.t("fishing.species_status.*",
//      locale)), so the dashboard renders it verbatim and derives the badge
//      color tier from the numeric `score` (locale-independent), never by
//      string-matching the translated status text. This table is kept
//      alongside the new per-period accordion (step 4) — the accordion adds
//      per-period detail on demand, the table gives the at-a-glance current
//      picture without any interaction.
//   7. Tide Forecast — TideChart (standalone, shared, unchanged).
//
// Also removed from the pre-F23 implementation: the local `Panel`/
// `StatTile` functions (replaced by Card/MarineStatTile), the standalone
// "Conditions" panel duplicating pressure/wind data (folded into steps 2-3
// above), `WindSwellContent` (wind speed folded into step 3; swell height/
// period dropped — fishing scoring doesn't use swell, unlike surfing), and
// the CUDEM Habitat Features panel (no slot in this structure;
// `habitatFeatures` remains in FishingDetailData, just unused by this tab).
//
// Data sources:
//   - useFishingDetail(locationId) — primary: days/periods/solunar/species/
//     habitat/tidePredictions (GET /fishing/{locationId}).
//   - useMarineDetail(locationId) — barometric pressure + trend, wind speed/
//     gust/direction, water temp, AND air temp for the Current Conditions
//     card (step 3). FishingForecast carries wind fields of its own, but
//     T6.1 deliberately sources ALL Current Conditions stats from the same
//     live marine `observation` record (rather than mixing in the
//     forecast-period's windSpeed/windGust/windDirection) so every stat in
//     that card reflects the same "right now" instant — same reasoning
//     BoatingTab.tsx/SurfingTab.tsx document for their own condition panels.
//   - `alerts` prop (MarineLocationSummary.activeAlerts, passed down from
//     marine.tsx) — same pattern as BoatingTab/SurfingTab; fishing has no
//     per-alert detail of its own to add.
//
// i18n note: the solunar moon phase name (`SolunarTimes.moonPhase`) reuses
// the Almanac page's existing `moonPhases.*` translation table (a second
// `useTranslation('almanac')` call) instead of duplicating that 8-entry
// table into marine.json across all 13 locales — DRY per rules/coding.md §3.
// The API wire format is underscore-separated ("waxing_crescent" per
// enrichment/solunar.py's docstring) while both the almanac.json keys and
// MoonPhaseG's WANING_PHASES set expect the hyphenated form
// ("waxing-crescent"), so every use converts underscores to hyphens first.
//
// A11y (rules/coding.md §5):
//   - Every panel heading is a real <h3> via CardTitle as="h3" (document
//     order sibling of the tab/accordion h3 header above it).
//   - The 3-day period grid renders as a real <table> (day rows × period
//     columns) — DESIGN-MANUAL §11 "Data Tables" / coding.md §5.2 require
//     semantic markup over CSS-grid-as-table for this shape of content.
//     Period cells contain a real <button> (T6.2), not `<div onClick>` —
//     keyboard reachable, aria-expanded/aria-controls wired to the shared
//     accordion panel below the table.
//   - The species table (both the standalone one and the per-period
//     accordion) is real markup with <thead>/<tbody>/<th scope> or an
//     equivalent labeled list — never a CSS-grid-as-table fake.
//   - The solunar arc and timeline are custom visuals (role="img" + sr-only
//     fallback table), matching the accessible-chart pattern already used
//     by SunMoonDetailCard and the shared TideChart.
//   - Color is never the only signal: score badges/cells pair color with
//     the numeric score; solunar overlap pairs color with a MoonStars icon
//     + sr-only text; pressure trend and tide state pair the arrow icon
//     with a text label; species status badges pair color with the
//     server-localized status text.
//   - Scoring Breakdown bars and period-grid buttons are real
//     <button type="button"> elements (aria-expanded/aria-controls), not
//     `<div onClick>` — keyboard reachable with a visible focus ring, per
//     coding.md §5.3/§5.4.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MoonStars,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Gauge,
  Wind,
  Thermometer,
  CaretDown,
} from '@phosphor-icons/react';
import type {
  FishingDay,
  FishingForecast,
  MarineAlertSummary,
  TidePrediction,
} from '../../../api/types';
import { useFishingDetail, useMarineDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatNumber } from '../../../utils/format-number';
import { formatShortDayOfWeek, formatMonthDay, formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { HorizontalScrollNav } from '../../ui/horizontal-scroll-nav';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { MarineStatTile } from '../shared/MarineStatTile';
import { MoonPhaseG, MoonPhaseIcon } from '../../moon-phase-icon';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FishingTabProps {
  locationId: string;
  alerts?: MarineAlertSummary[];
}

// ---------------------------------------------------------------------------
// Alert filtering — DASHBOARD-MANUAL §12 "Activity-relevant alert filtering":
// Fishing shows marine zone alerts only. `alertType` is a closed 3-value
// server-side bucket (docs/contracts/openapi-v1.yaml
// `MarineLocationSummary.activeAlerts[].alertType` enum: marineZone,
// coastalFlood, beachHazard) — NOT a per-NWS-product-type string — so this
// Set matches the wire value directly, no keyword/headline matching.
// ---------------------------------------------------------------------------

const FISHING_ALERT_TYPES = new Set(['marineZone']);

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// ---------------------------------------------------------------------------
// Score color helpers
// ---------------------------------------------------------------------------

/** 60/40 split — aligned with the "good"/"fair" cut points in the
 *  qualitative label scale (DASHBOARD-MANUAL §12 fishing thresholds:
 *  Excellent 80+ / Good 60-79 / Fair 40-59 / Poor <40) and with
 *  fishing_scorer.py's own species-status thresholds (60/30). Used for the
 *  hero score badge and the period-grid score cells. */
function scoreBgClass(score: number): string {
  if (score >= 60) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 40) return 'bg-amber-100 dark:bg-amber-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function scoreTextClass(score: number): string {
  if (score >= 60) return 'text-green-700 dark:text-green-300';
  if (score >= 40) return 'text-amber-700 dark:text-amber-300';
  return 'text-red-700 dark:text-red-300';
}

/** Scoring Breakdown bar fill — gauge color tokens per DESIGN-MANUAL §20
 *  "Scoring factor breakdown" (green >60, amber 30-60, muted <30). Matches
 *  SurfingTab.tsx's scoreBarFillColor precedent: --gauge-fill-good/
 *  --gauge-fill-moderate aren't in the DESIGN-MANUAL token table (only
 *  --gauge-fill/--gauge-unfill/--gauge-indicator are), but the fallback
 *  values (#16a34a green-600, #d97706 amber-600) are the same verified-AA
 *  shades SurfingTab already ships against --gauge-unfill's near-white
 *  light / near-black dark track, and bars are aria-hidden with the numeric
 *  score + label as the always-visible signal (never color-only). Reusing
 *  the exact same custom-property names as SurfingTab (rather than
 *  inventing new ones) keeps the two "scoring breakdown" implementations on
 *  one system, per rules/coding.md §10 "no ad-hoc one-offs".
 */
function scoreBarFillColor(pct: number): string {
  if (pct >= 60) return 'var(--gauge-fill-good, #16a34a)';
  if (pct >= 30) return 'var(--gauge-fill-moderate, #d97706)';
  return 'var(--gauge-unfill)';
}

/** DASHBOARD-MANUAL §12 fishing qualitative scale: Excellent 80+ / Good
 *  60-79 / Fair 40-59 / Poor <40. Keys resolve through the existing
 *  `qualitative.*` table (already shared with Boating/Beach Safety). */
function fishingQualityKey(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a "YYYY-MM-DD" date string to a Date anchored at UTC noon, so
 *  Intl formatting in any station timezone never rolls to the adjacent
 *  calendar day. This formats an already-known date string for display —
 *  it does not determine "what day is it" (ADR-075 governs that case;
 *  this is not it). */
function parseCalendarDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

interface SpeciesEntry {
  species: string;
  /** Already locale-translated by the API (fishing_scorer.py
   *  `_score_one_species`: `i18n.t("fishing.species_status.*", locale)`).
   *  Rendered verbatim — never re-translated or string-matched client-side. */
  status: string | null;
  score: number | null;
  /** Plain-English seasonal note from the API when present (e.g. "Spawning
   *  run — peak activity"); documented server-side as not yet locale-marked
   *  (fishing_scorer.py comment). Rendered verbatim, same treatment as
   *  `conditionsText` elsewhere in the marine tabs. */
  note: string | null;
}

/** speciesScores entries are Array<Record<string, unknown>> — the TS
 *  contract isn't a locked interface yet, so read defensively. The current
 *  wire shape (fishing_scorer.py `_score_one_species`) is
 *  `{ name, score, status, note? }`; `species`/`activity` are read as a
 *  fallback for schema drift, not the primary shape. */
function extractSpeciesEntry(raw: Record<string, unknown>): SpeciesEntry | null {
  const speciesRaw = raw.name ?? raw.species;
  if (typeof speciesRaw !== 'string' || speciesRaw.length === 0) return null;
  const statusRaw = raw.status ?? raw.activity;
  const status = typeof statusRaw === 'string' ? statusRaw : null;
  const scoreRaw = raw.score ?? raw.value ?? raw.rating;
  const score = typeof scoreRaw === 'number' ? scoreRaw : null;
  const noteRaw = raw.note;
  const note = typeof noteRaw === 'string' && noteRaw.length > 0 ? noteRaw : null;
  return { species: speciesRaw, status, score, note };
}

function topSpeciesLabel(speciesScores: Array<Record<string, unknown>> | null): string | null {
  if (!speciesScores || speciesScores.length === 0) return null;
  const entries = speciesScores.map(extractSpeciesEntry).filter((e): e is SpeciesEntry => e !== null);
  if (entries.length === 0) return null;
  const withScore = entries.filter((e) => e.score !== null);
  const best = withScore.length > 0
    ? withScore.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a))
    : entries[0];
  return best.species;
}

/** Color tier for the species status badge — derived from the numeric
 *  `score` (locale-independent), NOT by pattern-matching the already-
 *  translated `status` string (which reads e.g. "actif"/"inactif" in fr).
 *  Thresholds mirror fishing_scorer.py's own
 *  _SPECIES_STATUS_ACTIVE_THRESHOLD (60) / _SPECIES_STATUS_LESS_ACTIVE_THRESHOLD (30). */
function speciesScoreTier(score: number | null): 'active' | 'moderate' | 'inactive' | null {
  if (score === null) return null;
  if (score >= 60) return 'active';
  if (score >= 30) return 'moderate';
  return 'inactive';
}

const SPECIES_TIER_COLOR: Record<'active' | 'moderate' | 'inactive', string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  moderate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  inactive: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

/** Does [start,end) overlap any of the given ISO ranges? Pure interval
 *  math on API-provided instants — not a station-date determination. */
function overlapsAny(start: string, end: string, ranges: Array<{ start: string; end: string }>): boolean {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return ranges.some((r) => {
    const rs = new Date(r.start).getTime();
    const re = new Date(r.end).getTime();
    return s < re && e > rs;
  });
}

/** "Current" period = the one whose [start,end) contains now, falling back
 *  to the first period of the first day. Epoch-range containment against
 *  Date.now() — UTC elapsed-time math, not station-date determination
 *  (ADR-075 approved pattern). */
function findCurrentPeriod(days: FishingDay[]): FishingForecast | null {
  const now = Date.now();
  for (const day of days) {
    for (const period of day.periods) {
      const start = new Date(period.periodStart).getTime();
      const end = new Date(period.periodEnd).getTime();
      if (now >= start && now < end) return period;
    }
  }
  return days[0]?.periods[0] ?? null;
}

/** Look up the (day, period) pair whose `periodStart` matches `key` — used
 *  by the T6.2 per-period species accordion. `periodStart` (an ISO instant)
 *  is unique across the whole `days` array, so it doubles as a stable React
 *  key AND an accordion-selection key without needing a composite
 *  "date::index" string. */
function findPeriodByStart(days: FishingDay[], key: string): { day: FishingDay; period: FishingForecast } | null {
  for (const day of days) {
    const period = day.periods.find((p) => p.periodStart === key);
    if (period) return { day, period };
  }
  return null;
}

function dayWindow(day: FishingDay): [number, number] | null {
  if (day.periods.length === 0) return null;
  const start = new Date(day.periods[0].periodStart).getTime();
  const end = new Date(day.periods[day.periods.length - 1].periodEnd).getTime();
  if (!isFinite(start) || !isFinite(end) || end <= start) return null;
  return [start, end];
}

/** moonIllumination may arrive as a 0–1 fraction or a 0–100 percentage
 *  depending on provider; normalize defensively before formatting. */
function illuminationFraction(value: number): number {
  return value > 1 ? value / 100 : value;
}

function pressureTrendDirection(tendency: number | null): 'up' | 'down' | 'steady' | null {
  if (tendency === null) return null;
  if (tendency > 0) return 'up';
  if (tendency < 0) return 'down';
  return 'steady';
}

/** Tide direction at `nowMs`, derived from the tide predictions the tab
 *  already fetches — FishingForecast has no raw tide-state field (only the
 *  normalized tideScore). Finds the next high/low extremum at or after now:
 *  heading into a "high" means the tide is rising, into a "low" means
 *  falling. Falls back to comparing the last two known points when no
 *  future extremum is present in the fetched window. */
function computeTideState(predictions: TidePrediction[], nowMs: number): 'rising' | 'falling' | null {
  const sorted = [...predictions].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const extrema = sorted.filter((p) => p.type === 'high' || p.type === 'low');
  const next = extrema.find((p) => new Date(p.time).getTime() >= nowMs);
  if (next) return next.type === 'high' ? 'rising' : 'falling';
  if (sorted.length >= 2) {
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    if (last.height > prev.height) return 'rising';
    if (last.height < prev.height) return 'falling';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared small pieces (TileSkeleton/InlineError follow the same conventions
// established by BoatingTab.tsx / SurfingTab.tsx so all four marine
// activity tabs read as one system).
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`} aria-hidden="true" />;
}

function InlineError({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

function PressureTrend({ tendency, t }: { tendency: number | null; t: TFn }) {
  const direction = pressureTrendDirection(tendency);
  if (direction === null) return null;
  if (direction === 'steady') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
        <ArrowRight aria-hidden="true" focusable="false" className="size-4" />
        {t('fishing.pressureTrend.steady')}
      </span>
    );
  }
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-foreground" style={{ fontSize: 'var(--text-label)' }}>
        <ArrowUp aria-hidden="true" focusable="false" className="size-4" />
        {t('fishing.pressureTrend.up')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-foreground" style={{ fontSize: 'var(--text-label)' }}>
      <ArrowDown aria-hidden="true" focusable="false" className="size-4" />
      {t('fishing.pressureTrend.down')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ScoreFactorBar — a single weighted-factor bar in the Scoring Breakdown.
// A real <button> (not a div) so the explanation is keyboard-reachable and
// screen-reader-discoverable via aria-expanded/aria-controls.
// ---------------------------------------------------------------------------

function ScoreFactorBar({
  factorKey,
  label,
  weight,
  weightDecimals,
  score,
  locale,
  t,
}: {
  factorKey: string;
  label: string;
  weight: number;
  weightDecimals: number;
  score: number;
  locale: string;
  t: TFn;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.max(0, Math.min(100, score));
  const explanationId = `fishing-scoring-explain-${factorKey}`;
  const weightLabel = formatNumber(weight, weightDecimals, locale);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={explanationId}
        className="flex items-center gap-2 w-full text-left rounded py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CaretDown
          aria-hidden="true"
          focusable="false"
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
        <span className="text-muted-foreground shrink-0 w-32 sm:w-40 truncate" style={{ fontSize: 'var(--text-label)' }}>
          {t('fishing.scoring.factorLabel', { label, weight: weightLabel })}
        </span>
        <span
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--gauge-unfill)' }}
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: scoreBarFillColor(pct) }}
          />
        </span>
        <span
          className="shrink-0 w-9 text-right font-semibold text-foreground"
          style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}
        >
          {formatNumber(Math.round(pct), 0, locale)}
        </span>
      </button>
      {expanded && (
        <p id={explanationId} className="text-muted-foreground pl-6" style={{ fontSize: 'var(--text-micro)' }}>
          {t(`fishing.scoring.explanations.${factorKey}`)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeriodGrid — 3-day forecast as a semantic table (day rows × period cols)
// ---------------------------------------------------------------------------

/** ID of the shared per-period species accordion panel (T6.2). Always
 *  mounted (see PeriodGrid below) so every period button's aria-controls
 *  resolves to a real element whether or not a period is currently
 *  selected — a dangling aria-controls reference is a spec violation even
 *  when no screen reader happens to surface it. */
const PERIOD_ACCORDION_ID = 'fishing-period-species-accordion';

function PeriodGrid({ days, locale, stationTz, t }: { days: FishingDay[]; locale: string; stationTz: string; t: TFn }) {
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  const headerDay = useMemo(
    () => days.reduce((longest, d) => (d.periods.length > longest.periods.length ? d : longest), days[0]),
    [days],
  );
  const columnCount = headerDay?.periods.length ?? 0;

  const selected = expandedPeriod !== null ? findPeriodByStart(days, expandedPeriod) : null;
  const selectedEntries = useMemo(() => {
    if (!selected?.period.speciesScores) return [];
    return selected.period.speciesScores.map(extractSpeciesEntry).filter((e): e is SpeciesEntry => e !== null);
  }, [selected]);

  function toggle(periodStart: string) {
    setExpandedPeriod((current) => (current === periodStart ? null : periodStart));
  }

  if (columnCount === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('fishing.noData')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <HorizontalScrollNav ariaLabel={t('fishing.periodGridScrollAriaLabel')}>
        <table className="w-full border-collapse" style={{ fontSize: 'var(--text-body)' }}>
          <caption className="sr-only">{t('fishing.periodGridCaption')}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[rgb(var(--card-glass))] text-left p-2 whitespace-nowrap"
                style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--muted-foreground)' }}
              >
                {t('fishing.day')}
              </th>
              {headerDay.periods.map((p, i) => (
                <th
                  key={i}
                  scope="col"
                  className="text-left p-2 whitespace-nowrap"
                  style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--muted-foreground)' }}
                >
                  {p.periodLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, rowIdx) => {
              const dateObj = parseCalendarDate(day.date);
              const weekdayLabel = formatShortDayOfWeek(dateObj, locale, stationTz);
              const monthDayLabel = formatMonthDay(dateObj, locale, stationTz);
              return (
                <tr key={day.date} className={rowIdx % 2 === 1 ? 'bg-muted/30' : undefined}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[rgb(var(--card-glass))] text-left p-2 align-top whitespace-nowrap font-semibold text-foreground"
                  >
                    {weekdayLabel}
                    <br />
                    <span className="text-muted-foreground font-normal" style={{ fontSize: 'var(--text-micro)' }}>
                      {monthDayLabel}
                    </span>
                  </th>
                  {Array.from({ length: columnCount }).map((_, colIdx) => {
                    const period = day.periods[colIdx];
                    if (!period) {
                      return <td key={colIdx} className="p-2 text-center text-muted-foreground">—</td>;
                    }
                    const isMajor = overlapsAny(period.periodStart, period.periodEnd, day.solunar.majorPeriods);
                    const isMinor = !isMajor && overlapsAny(period.periodStart, period.periodEnd, day.solunar.minorPeriods);
                    const top = topSpeciesLabel(period.speciesScores);
                    const isExpanded = expandedPeriod === period.periodStart;
                    return (
                      <td key={colIdx} className="p-1 align-top">
                        <button
                          type="button"
                          onClick={() => toggle(period.periodStart)}
                          aria-expanded={isExpanded}
                          aria-controls={PERIOD_ACCORDION_ID}
                          aria-label={t('fishing.periodButtonAriaLabel', {
                            weekday: weekdayLabel,
                            date: monthDayLabel,
                            period: period.periodLabel,
                            score: formatNumber(Math.round(period.overallScore), 0, locale),
                          })}
                          className={`w-full flex flex-col gap-0.5 min-w-[4.5rem] p-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${scoreBgClass(period.overallScore)} ${isExpanded ? 'ring-2 ring-primary' : ''}`}
                        >
                          <span aria-hidden="true" className="flex flex-col gap-0.5">
                            <span className="flex items-center justify-between gap-1">
                              <span
                                className={`font-bold ${scoreTextClass(period.overallScore)}`}
                                style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
                              >
                                {formatNumber(Math.round(period.overallScore), 0, locale)}
                              </span>
                              <CaretDown
                                focusable="false"
                                className={`size-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </span>
                            {top && (
                              <span className="text-foreground truncate" style={{ fontSize: 'var(--text-micro)' }}>
                                {top}
                              </span>
                            )}
                            {(isMajor || isMinor) && (
                              <span className="inline-flex items-center gap-0.5 text-foreground">
                                <MoonStars
                                  weight={isMajor ? 'fill' : 'regular'}
                                  className="size-[18px]"
                                />
                                <span className="sr-only">{isMajor ? t('fishing.majorPeriod') : t('fishing.minorPeriod')}</span>
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </HorizontalScrollNav>

      {/* Per-period species accordion (T6.2) — always mounted so
          aria-controls on every period button resolves to a real element;
          `hidden` removes it from the a11y tree and layout when nothing is
          selected. Content only renders when a period is actually
          selected. */}
      <div
        id={PERIOD_ACCORDION_ID}
        hidden={selected === null}
        className="rounded-lg border border-border p-3 flex flex-col gap-2"
      >
        {selected && (
          <>
            <h4 className="font-semibold text-foreground" style={{ fontSize: 'var(--text-label)' }}>
              {t('fishing.periodDetailHeading', {
                weekday: formatShortDayOfWeek(parseCalendarDate(selected.day.date), locale, stationTz),
                date: formatMonthDay(parseCalendarDate(selected.day.date), locale, stationTz),
                period: selected.period.periodLabel,
              })}
            </h4>
            {selectedEntries.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {selectedEntries.map((e, i) => (
                  <li key={`${e.species}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="text-foreground" style={{ fontSize: 'var(--text-body)' }}>{e.species}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span
                        className="font-semibold text-foreground"
                        style={{ fontSize: 'var(--text-body)', fontFeatureSettings: '"tnum"' }}
                      >
                        {e.score !== null ? formatNumber(Math.round(e.score), 0, locale) : '—'}
                      </span>
                      <SpeciesStatusBadge status={e.status} score={e.score} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {t('fishing.noSpeciesData')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpeciesTable — Species / Score / Status (+ Notes when present)
// ---------------------------------------------------------------------------

function SpeciesStatusBadge({ status, score }: { status: string | null; score: number | null }) {
  if (status === null) return <span className="text-muted-foreground">—</span>;
  const tier = speciesScoreTier(score);
  const colorClass = tier ? SPECIES_TIER_COLOR[tier] : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex w-fit items-center rounded px-2 py-0.5 font-semibold ${colorClass}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      {status}
    </span>
  );
}

function SpeciesTable({ period, species, locale, t }: { period: FishingForecast | null; species: string[]; locale: string; t: TFn }) {
  const entries = useMemo(() => {
    if (!period?.speciesScores || period.speciesScores.length === 0) return [];
    return period.speciesScores.map(extractSpeciesEntry).filter((e): e is SpeciesEntry => e !== null);
  }, [period]);

  const hasNoteColumn = entries.some((e) => e.note !== null);

  const headerStyle: React.CSSProperties = {
    fontSize: 'var(--text-label)',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
  };

  return (
    <Card footprint="full">
      <CardHeader>
        <CardTitle as="h3">{t('fishing.speciesTable')}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ fontSize: 'var(--text-body)' }}>
              <caption className="sr-only">{t('fishing.speciesTableCaption')}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-[rgb(var(--card-glass))] text-left p-2"
                    style={headerStyle}
                  >
                    {t('fishing.species')}
                  </th>
                  <th scope="col" className="text-right p-2" style={headerStyle}>
                    {t('fishing.score')}
                  </th>
                  <th scope="col" className="text-left p-2" style={headerStyle}>
                    {t('fishing.statusColumn')}
                  </th>
                  {hasNoteColumn && (
                    <th scope="col" className="text-left p-2" style={headerStyle}>
                      {t('fishing.noteColumn')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${e.species}-${i}`} className={i % 2 === 1 ? 'bg-muted/30' : undefined}>
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 text-left p-2 font-normal text-foreground whitespace-nowrap ${i % 2 === 1 ? 'bg-muted/30' : 'bg-[rgb(var(--card-glass))]'}`}
                    >
                      {e.species}
                    </th>
                    <td className="p-2 text-right font-semibold text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
                      {e.score !== null ? formatNumber(Math.round(e.score), 0, locale) : '—'}
                    </td>
                    <td className="p-2">
                      <SpeciesStatusBadge status={e.status} score={e.score} />
                    </td>
                    {hasNoteColumn && (
                      <td className="p-2 text-muted-foreground">{e.note ?? '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : species.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {species.map((s) => (
              <li key={s} className="text-foreground" style={{ fontSize: 'var(--text-body)' }}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('fishing.noSpeciesData')}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Solunar arc geometry — semi-ellipse math, same technique as
// SunMoonDetailCard.tsx (not imported, to avoid coupling the marine tab to
// the almanac card — same reasoning SunMoonDetailCard itself documents for
// not importing sun-moon-card.tsx).
// ---------------------------------------------------------------------------

const ARC_VIEWBOX_W = 460;
const ARC_VIEWBOX_H = 260;
const ARC_CX = 230;
const ARC_CY = 210;
const ARC_RX = 190;
const ARC_RY = 155;
const ARC_DASH = '7 4';
/** Silver — same MOON_COLOR as SunMoonDetailCard.tsx (verified AA contrast
 *  there: 4.52:1 dark / 3.08:1 light, meeting the 3:1 non-text floor). */
const ARC_MOON_COLOR = '#94a3b8';

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const x0 = cx - rx;
  const x1 = cx + rx;
  return `M ${x0} ${cy} A ${rx} ${ry} 0 1 1 ${x1} ${cy}`;
}

function arcPoint(pct: number, cx: number, cy: number, rx: number, ry: number): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, pct));
  const angle = Math.PI * (1 - clamped);
  return { x: cx + rx * Math.cos(angle), y: cy - ry * Math.sin(angle) };
}

/** Ramanujan semi-perimeter approximation for a semi-ellipse — same formula
 *  SunMoonDetailCard.tsx uses for its traveled-arc dasharray technique. */
function semiPerimeter(rx: number, ry: number): number {
  return (Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))) / 2;
}

/** Fraction [0,1] of how far `atMs` sits between `startIso` and `endIso`,
 *  handling the cross-midnight case (moonset earlier in the calendar day
 *  than moonrise → the moon actually sets the following day). Returns null
 *  when either endpoint is missing/invalid — the caller then treats the
 *  moon as "not currently up" rather than guessing a position. */
function arcProgressFraction(startIso: string | null, endIso: string | null, atMs: number): number | null {
  if (!startIso || !endIso) return null;
  const startMs = new Date(startIso).getTime();
  let endMs = new Date(endIso).getTime();
  if (!isFinite(startMs) || !isFinite(endMs)) return null;
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
  return (atMs - startMs) / (endMs - startMs);
}

// ---------------------------------------------------------------------------
// SolunarCard — arc visualization + horizontal timeline + moon phase row +
// sr-only fallback table, matching SunMoonDetailCard's visual quality
// (DASHBOARD-MANUAL §12 "Solunar Calendar" / DESIGN-MANUAL §20 "Solunar
// display").
// ---------------------------------------------------------------------------

function SolunarCard({ day, locale, stationTz, t, tAlmanac }: { day: FishingDay; locale: string; stationTz: string; t: TFn; tAlmanac: TFn }) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const solunar = day.solunar;
  const timeWindow = dayWindow(day);

  // Horizontal timeline — full day span, major/minor segments + now marker.
  const timelineMarkers = useMemo(() => {
    if (!timeWindow) return [];
    const [start, end] = timeWindow;
    const span = end - start;
    const pct = (iso: string) => Math.max(0, Math.min(100, ((new Date(iso).getTime() - start) / span) * 100));
    const bars: Array<{ id: string; left: number; width: number; kind: 'major' | 'minor' }> = [];
    solunar.majorPeriods.forEach((p, i) => {
      bars.push({ id: `major-${i}`, left: pct(p.start), width: Math.max(0.5, pct(p.end) - pct(p.start)), kind: 'major' });
    });
    solunar.minorPeriods.forEach((p, i) => {
      bars.push({ id: `minor-${i}`, left: pct(p.start), width: Math.max(0.5, pct(p.end) - pct(p.start)), kind: 'minor' });
    });
    return bars;
  }, [timeWindow, solunar]);

  const nowInTimeline = timeWindow ? nowMs >= timeWindow[0] && nowMs <= timeWindow[1] : false;
  const nowTimelinePct = timeWindow ? ((nowMs - timeWindow[0]) / (timeWindow[1] - timeWindow[0])) * 100 : 0;

  // Arc — moonrise→moonset window, major/minor periods highlighted on it.
  const moonPct = arcProgressFraction(solunar.moonrise, solunar.moonset, nowMs);
  const moonUp = moonPct !== null && moonPct >= 0 && moonPct <= 1;
  const moonMarker = moonUp && moonPct !== null ? arcPoint(moonPct, ARC_CX, ARC_CY, ARC_RX, ARC_RY) : null;
  const arcLen = semiPerimeter(ARC_RX, ARC_RY);

  function arcSegment(period: { start: string; end: string }): { start: number; end: number } | null {
    const p0 = arcProgressFraction(solunar.moonrise, solunar.moonset, new Date(period.start).getTime());
    const p1 = arcProgressFraction(solunar.moonrise, solunar.moonset, new Date(period.end).getTime());
    if (p0 === null || p1 === null) return null;
    const lo = Math.max(0, Math.min(p0, p1));
    const hi = Math.min(1, Math.max(p0, p1));
    if (hi <= lo) return null;
    return { start: lo, end: hi };
  }

  const majorArcSegments = solunar.majorPeriods.map(arcSegment).filter((s): s is { start: number; end: number } => s !== null);
  const minorArcSegments = solunar.minorPeriods.map(arcSegment).filter((s): s is { start: number; end: number } => s !== null);

  const illumFraction = illuminationFraction(solunar.moonIllumination);
  const illumPercent = Math.round(illumFraction * 100);
  const hyphenPhase = solunar.moonPhase.replace(/_/g, '-');
  const phaseLabel = tAlmanac(`moonPhases.${hyphenPhase}`, { defaultValue: solunar.moonPhase });
  // Composed via i18next interpolation (not JS string concatenation) —
  // reuses almanac.json's existing "phaseIllumination"/"illuminatedPercent"
  // templates so word order stays correct per locale (rules/coding.md
  // §6.1). illumText mirrors SunMoonDetailCard.tsx's own `${Math.round(...)}%`
  // composition — the '%' glyph isn't word-order-sensitive text, only the
  // digit formatting is, and Math.round() + template here matches that
  // file's existing precedent rather than inventing a second convention.
  const illumText = `${formatNumber(illumPercent, 0, locale)}%`;
  const phaseIllumLabel = tAlmanac('phaseIllumination', { phase: phaseLabel, illumination: illumText });

  const moonriseText = solunar.moonrise ? formatTime(new Date(solunar.moonrise), locale, stationTz) : '—';
  const moonsetText = solunar.moonset ? formatTime(new Date(solunar.moonset), locale, stationTz) : '—';

  return (
    <Card footprint="full">
      <CardHeader>
        <CardTitle as="h3">{t('fishing.solunar')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Arc visualization */}
        <div className="flex flex-col items-center gap-3">
          <svg
            role="img"
            viewBox={`0 0 ${ARC_VIEWBOX_W} ${ARC_VIEWBOX_H}`}
            width="100%"
            style={{ display: 'block', maxWidth: '460px' }}
          >
            <title>{t('fishing.solunarArcAriaLabel')}</title>

            <defs>
              <clipPath id="fishing-solunar-above-horizon">
                <rect x={0} y={0} width={ARC_VIEWBOX_W} height={ARC_CY} />
              </clipPath>
            </defs>

            <line
              x1={ARC_CX - ARC_RX - 10}
              y1={ARC_CY}
              x2={ARC_CX + ARC_RX + 10}
              y2={ARC_CY}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.25}
              aria-hidden="true"
            />

            {/* Base dashed arc (decorative track) */}
            <path
              d={ellipsePath(ARC_CX, ARC_CY, ARC_RX, ARC_RY)}
              fill="none"
              stroke={ARC_MOON_COLOR}
              strokeWidth={2.5}
              strokeDasharray={ARC_DASH}
              strokeLinecap="round"
              opacity={0.3}
              clipPath="url(#fishing-solunar-above-horizon)"
              aria-hidden="true"
            />

            {/* Minor period windows — muted accent */}
            {minorArcSegments.map((seg, i) => (
              <path
                key={`minor-arc-${i}`}
                d={ellipsePath(ARC_CX, ARC_CY, ARC_RX, ARC_RY)}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={4}
                strokeLinecap="round"
                opacity={0.4}
                strokeDasharray={`${(seg.end - seg.start) * arcLen} ${arcLen}`}
                strokeDashoffset={-(seg.start * arcLen)}
                clipPath="url(#fishing-solunar-above-horizon)"
                aria-hidden="true"
              />
            ))}

            {/* Major period windows — full accent */}
            {majorArcSegments.map((seg, i) => (
              <path
                key={`major-arc-${i}`}
                d={ellipsePath(ARC_CX, ARC_CY, ARC_RX, ARC_RY)}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray={`${(seg.end - seg.start) * arcLen} ${arcLen}`}
                strokeDashoffset={-(seg.start * arcLen)}
                clipPath="url(#fishing-solunar-above-horizon)"
                aria-hidden="true"
              />
            ))}

            {/* Rise/set endpoint dots */}
            <circle cx={ARC_CX - ARC_RX} cy={ARC_CY} r={4} fill={ARC_MOON_COLOR} opacity={0.7} aria-hidden="true" />
            <circle cx={ARC_CX + ARC_RX} cy={ARC_CY} r={4} fill={ARC_MOON_COLOR} opacity={0.4} aria-hidden="true" />

            {/* Moon position marker (only when currently up) */}
            {moonMarker && (
              <g aria-hidden="true">
                <MoonPhaseG
                  cx={moonMarker.x}
                  cy={moonMarker.y}
                  r={11}
                  illuminationPercent={illumFraction * 100}
                  phaseName={hyphenPhase}
                />
              </g>
            )}

            {/* Rise/set time labels */}
            <text
              x={ARC_CX - ARC_RX}
              y={ARC_CY + 22}
              textAnchor="middle"
              fontFamily="var(--font-sans, system-ui, sans-serif)"
              fontSize={13}
              fontWeight={600}
              fill={ARC_MOON_COLOR}
              aria-hidden="true"
            >
              {moonriseText}
            </text>
            <text
              x={ARC_CX + ARC_RX}
              y={ARC_CY + 22}
              textAnchor="middle"
              fontFamily="var(--font-sans, system-ui, sans-serif)"
              fontSize={13}
              fontWeight={600}
              fill={ARC_MOON_COLOR}
              aria-hidden="true"
            >
              {moonsetText}
            </text>
          </svg>

          {!moonUp && (
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
              {t('fishing.moonBelowHorizon')}
            </p>
          )}

          {/* Moon phase row. No aria-label on this wrapping <div> — a plain
              div's implicit ARIA role is "generic", and aria-label has no
              effect on generic elements per the ARIA-in-HTML spec (same
              gotcha SurfingTab.tsx's StarRating comment documents). The
              accessible name comes from MoonPhaseIcon's own role="img" +
              aria-label below, backed up by the adjacent visible text. */}
          <div className="flex items-center gap-3">
            <MoonPhaseIcon
              size={40}
              illuminationPercent={illumFraction * 100}
              phaseName={hyphenPhase}
              ariaLabel={phaseIllumLabel}
            />
            <div>
              <div className="font-semibold" style={{ fontSize: 'var(--text-secondary, 0.85rem)' }}>
                {phaseLabel}
              </div>
              <div className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                {tAlmanac('illuminatedPercent', { illumination: illumText })}
              </div>
            </div>
          </div>
        </div>

        {/* Horizontal timeline strip */}
        {timeWindow && (
          <div className="flex flex-col gap-2">
            <div
              role="img"
              aria-label={t('fishing.solunarTimelineAriaLabel')}
              className="relative h-6 rounded-md bg-muted overflow-hidden"
            >
              {timelineMarkers.map((m) => (
                <div
                  key={m.id}
                  className={m.kind === 'major' ? 'absolute top-0.5 bottom-0.5 rounded-sm bg-primary' : 'absolute top-1.5 bottom-1.5 rounded-sm bg-primary/50'}
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                />
              ))}
              {nowInTimeline && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground"
                  style={{ left: `${nowTimelinePct}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 'var(--text-micro)' }}>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="inline-block w-3 h-2 rounded-sm bg-primary" aria-hidden="true" />
                {t('fishing.majorPeriod')}
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="inline-block w-3 h-2 rounded-sm bg-primary/50" aria-hidden="true" />
                {t('fishing.minorPeriod')}
              </span>
              {nowInTimeline && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="inline-block w-0.5 h-3 bg-foreground" aria-hidden="true" />
                  {t('tide.now', { defaultValue: 'Now' })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* sr-only fallback data table for both visuals (coding.md §5.5) */}
        <table className="sr-only">
          <caption>{t('fishing.solunarTimelineAriaLabel')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('fishing.periodGrid')}</th>
              <th scope="col">{t('fishing.day')}</th>
            </tr>
          </thead>
          <tbody>
            {solunar.majorPeriods.map((p, i) => (
              <tr key={`sr-major-${i}`}>
                <td>{t('fishing.majorPeriod')}</td>
                <td>{formatTime(new Date(p.start), locale, stationTz)} – {formatTime(new Date(p.end), locale, stationTz)}</td>
              </tr>
            ))}
            {solunar.minorPeriods.map((p, i) => (
              <tr key={`sr-minor-${i}`}>
                <td>{t('fishing.minorPeriod')}</td>
                <td>{formatTime(new Date(p.start), locale, stationTz)} – {formatTime(new Date(p.end), locale, stationTz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FishingTab — main export
// ---------------------------------------------------------------------------

export function FishingTab({ locationId, alerts = [] }: FishingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const { t: tAlmanac } = useTranslation('almanac');
  const locale = i18n.language;
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  const { data, units, loading, error, refetch } = useFishingDetail(locationId);
  const { data: marineBundle, units: marineUnits, loading: marineLoading } = useMarineDetail(locationId);
  const observation = marineBundle?.observation ?? null;
  const pressureUnit = marineUnits?.pressure ?? 'mb';
  const tempUnit = marineUnits?.temperature ?? '';

  // Whole-tab loading state — fishing data is foundational to every panel below.
  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">{t('fishing.loading')}</span>
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-32" />
        <TileSkeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <InlineError message={t('fishing.unableToLoad')} onRetry={refetch} retryLabel={tCommon('retry')} />;
  }

  if (!data) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('fishing.noData')}
      </p>
    );
  }

  const currentPeriod = findCurrentPeriod(data.days);
  const tideHeightUnit = units?.height ?? 'ft';
  const marineWindUnit = marineUnits?.windSpeed ?? 'kn';
  const tideState = computeTideState(data.tidePredictions, Date.now());
  const windDirCardinal = cardinalFromDegrees(observation?.windDirection ?? null);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : null;

  const scoringFactors = currentPeriod
    ? [
        { key: 'pressure', label: t('fishing.scoring.pressure'), weight: 37.5, weightDecimals: 1, score: currentPeriod.pressureScore },
        { key: 'tide', label: t('fishing.scoring.tide'), weight: 31.25, weightDecimals: 2, score: currentPeriod.tideScore },
        { key: 'solunar', label: t('fishing.scoring.solunar'), weight: 18.75, weightDecimals: 2, score: currentPeriod.solunarScore },
        { key: 'timeofday', label: t('fishing.scoring.timeofday'), weight: 12.5, weightDecimals: 1, score: currentPeriod.timeofdayScore },
      ]
    : [];

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Activity-relevant alerts — top, prominent */}
      <AlertsPanel alerts={alerts} filterTypes={FISHING_ALERT_TYPES} />

      {/* 2. Score — headline + overall score/label, with the 4 weighted
          scoring-factor bars merged directly below (T6.1: previously a
          separate "Scoring Breakdown" card). Both halves depend on the same
          `currentPeriod`, so a single "no data" branch covers both. */}
      <Card footprint="wide">
        <CardHeader>
          <CardTitle as="h3">{t('fishing.scoreCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {currentPeriod === null ? (
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
              {t('fishing.hero.noConditionsData')}
            </p>
          ) : (
            <>
              <p className="font-semibold text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {currentPeriod.conditionsText}
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-lg px-3 py-2 font-bold ${scoreBgClass(currentPeriod.overallScore)} ${scoreTextClass(currentPeriod.overallScore)}`}
                  style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
                >
                  {t('fishing.hero.scoreFraction', { score: formatNumber(Math.round(currentPeriod.overallScore), 0, locale), max: 100 })}
                </span>
                <span className="font-semibold text-foreground" style={{ fontSize: 'var(--text-label)' }}>
                  {t(`qualitative.${fishingQualityKey(currentPeriod.overallScore)}`)}
                </span>
              </div>

              <div className="flex flex-col gap-3 pt-2 border-t border-border">
                <h4 className="font-semibold text-foreground" style={{ fontSize: 'var(--text-label)' }}>
                  {t('fishing.scoring.title')}
                </h4>
                {scoringFactors.map((f) => (
                  <ScoreFactorBar
                    key={f.key}
                    factorKey={f.key}
                    label={f.label}
                    weight={f.weight}
                    weightDecimals={f.weightDecimals}
                    score={f.score}
                    locale={locale}
                    t={t}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Current Conditions — stat grid pulled out of the score card
          (T6.1). Every stat sources from the live `observation` record
          (useMarineDetail), not the fishing-forecast period, so this card
          reads as "right now". */}
      <Card footprint="wide">
        <CardHeader>
          <CardTitle as="h3">{t('fishing.currentConditions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <MarineStatTile
              icon={<Gauge aria-hidden="true" focusable="false" />}
              label={t('fishing.pressure')}
              value={marineLoading ? '—' : formatValue(observation?.pressure ?? null, 'barometer', locale)}
              unit={observation?.pressure != null ? pressureUnit : undefined}
            />
            <MarineStatTile
              icon={<Wind aria-hidden="true" focusable="false" />}
              label={t('windSpeed')}
              value={marineLoading ? '—' : formatValue(observation?.windSpeed ?? null, 'wind', locale)}
              unit={observation?.windSpeed != null ? marineWindUnit : undefined}
            />
            <MarineStatTile
              icon={<Wind aria-hidden="true" focusable="false" />}
              label={t('fishing.windGust')}
              value={marineLoading ? '—' : formatValue(observation?.windGust ?? null, 'wind', locale)}
              unit={observation?.windGust != null ? marineWindUnit : undefined}
            />
            <MarineStatTile
              label={t('fishing.direction')}
              value={marineLoading ? '—' : (windDirLabel ?? '—')}
            />
            <MarineStatTile
              icon={<Thermometer aria-hidden="true" focusable="false" />}
              label={t('waterTemp')}
              value={marineLoading ? '—' : formatValue(observation?.waterTemp ?? null, 'temperature', locale)}
              unit={observation?.waterTemp != null ? tempUnit : undefined}
            />
            <MarineStatTile
              icon={<Thermometer aria-hidden="true" focusable="false" />}
              label={t('airTemp')}
              value={marineLoading ? '—' : formatValue(observation?.airTemp ?? null, 'temperature', locale)}
              unit={observation?.airTemp != null ? tempUnit : undefined}
            />
            <MarineStatTile
              icon={tideState === 'rising' ? <ArrowUp aria-hidden="true" focusable="false" /> : tideState === 'falling' ? <ArrowDown aria-hidden="true" focusable="false" /> : undefined}
              label={t('fishing.hero.tideState')}
              value={tideState === 'rising' ? t('fishing.hero.tideRising') : tideState === 'falling' ? t('fishing.hero.tideFalling') : '—'}
            />
          </dl>
          <PressureTrend tendency={observation?.pressureTendency ?? null} t={t} />
        </CardContent>
      </Card>

      {/* 4. Forecast Periods */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('fishing.periodGrid')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PeriodGrid days={data.days} locale={locale} stationTz={stationTz} t={t} />
        </CardContent>
      </Card>

      {/* 5. Solunar Calendar */}
      {data.days[0] && <SolunarCard day={data.days[0]} locale={locale} stationTz={stationTz} t={t} tAlmanac={tAlmanac} />}

      {/* 6. Species Forecast */}
      <SpeciesTable period={currentPeriod} species={data.species} locale={locale} t={t} />

      {/* 7. Tide Forecast */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('fishing.tides')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TideChart
            predictions={data.tidePredictions}
            locale={locale}
            stationTz={stationTz}
            heightUnit={tideHeightUnit}
            ariaLabel={t('fishing.tideChartAriaLabel', { location: data.locationName })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default FishingTab;
