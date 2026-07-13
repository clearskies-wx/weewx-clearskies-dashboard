// FishingTab.tsx — Fishing activity tab content for the Marine Activities
// page (DASHBOARD-MANUAL §12, T7.4; consolidated per Phase 1 T1.5/T1.8).
// Full data ensemble for a single location's fishing conditions:
// activity-relevant alerts, 3-day period grid, conditions breakdown (score
// bars — moved directly after the period grid so the scoring rationale
// sits next to the forecast it explains), solunar calendar, standalone
// tide chart, a consolidated Conditions panel (barometric pressure + wind
// & swell, display-only), species forecast table, and CUDEM habitat
// features.
//
// Follows the same structure as the sibling tabs landed alongside this one
// (BoatingTab.tsx / BeachSafetyTab.tsx, T7.2/T7.3): a local `Panel` section
// wrapper (not the shadcn Card primitive — the tab content sits inside an
// ActivityTabs/ActivityAccordion panel, not the page grid, so the plain
// card-glass section matches what the other three tabs already render),
// the shared `AlertsPanel` at the top, the shared `TideChart` for the
// standalone 72h tide chart, and all data hooks called once at the top of
// the exported component rather than inside child components.
//
// Data sources:
//   - useFishingDetail(locationId) — primary: days/periods/solunar/species/
//     habitat/tidePredictions (GET /fishing/{locationId}).
//   - useMarineDetail(locationId) — barometric pressure panel only. Raw
//     `pressure` + `pressureTendency` are not part of FishingDetailData
//     (FishingForecast only carries the normalized pressureScore used in
//     the Conditions Breakdown), so the panel sources the real observed
//     value from the marine bundle instead of fabricating one from a score
//     — same reasoning BoatingTab.tsx documents for its own pressure panel.
//   - `alerts` prop (MarineLocationSummary.activeAlerts, passed down from
//     marine.tsx) — same pattern as BoatingTab/BeachSafetyTab; fishing has
//     no per-alert detail of its own to add.
//
// A11y (rules/coding.md §5):
//   - Every panel heading is a real <h3> (document-order sibling of the
//     tab/accordion h3 header above it, not a skipped level).
//   - The 3-day period grid renders as a real <table> (day rows × period
//     columns) rather than a bare CSS grid — this is genuinely tabular
//     data and DESIGN-MANUAL §11 "Data Tables" / coding.md §5.2 require
//     semantic markup over CSS-grid-as-table for this shape of content.
//   - The solunar timeline is a custom visual (role="img" + sr-only
//     fallback table), matching the accessible-chart pattern already used
//     by solar-radiation-card.tsx and the shared TideChart.
//   - Color is never the only signal: score cells pair color with the
//     numeric score and period label; solunar overlap pairs color with a
//     MoonStars icon + sr-only text; pressure trend pairs the arrow icon
//     with a text label.

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoonStars, MapPin, ArrowUp, ArrowDown, ArrowRight } from '@phosphor-icons/react';
import type { FishingDay, FishingForecast, UnitsBlock } from '../../../api/types';
import { useFishingDetail, useMarineDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatNumber } from '../../../utils/format-number';
import { formatShortDayOfWeek, formatMonthDay, formatTime } from '../../../utils/format-date';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FishingTabProps {
  locationId: string;
  /** Active marine-zone alert headlines for this location (from MarineLocationSummary.activeAlerts). */
  alerts?: string[];
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// ---------------------------------------------------------------------------
// Score color helpers (coordinator spec)
// ---------------------------------------------------------------------------

function scoreBgClass(score: number): string {
  if (score >= 70) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 40) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function scoreTextClass(score: number): string {
  if (score >= 70) return 'text-green-700 dark:text-green-300';
  if (score >= 40) return 'text-yellow-700 dark:text-yellow-300';
  return 'text-red-700 dark:text-red-300';
}

/** Solid fill color for the ScoreBar's proportional bar — a darker/more
 *  saturated step than scoreBgClass's pale cell background, so the bar
 *  reads clearly against both the cell tint and the neutral bg-muted
 *  track it sits in. */
function scoreFillClass(score: number): string {
  if (score >= 70) return 'bg-green-500 dark:bg-green-600';
  if (score >= 40) return 'bg-yellow-500 dark:bg-yellow-600';
  return 'bg-red-500 dark:bg-red-600';
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

/** speciesScores entries are Array<Record<string, unknown>> — the exact
 *  shape isn't locked in the API contract yet. Read common key variants
 *  defensively rather than assuming one exact shape. */
function extractSpeciesEntry(raw: Record<string, unknown>): { species: string; activity: string | null; score: number | null } | null {
  const species = raw.species ?? raw.name;
  if (typeof species !== 'string' || species.length === 0) return null;
  const activityRaw = raw.activity ?? raw.status ?? raw.activityLevel;
  const activity = typeof activityRaw === 'string' ? activityRaw : null;
  const scoreRaw = raw.score ?? raw.value ?? raw.rating;
  const score = typeof scoreRaw === 'number' ? scoreRaw : null;
  return { species, activity, score };
}

function topSpeciesLabel(speciesScores: Array<Record<string, unknown>> | null): string | null {
  if (!speciesScores || speciesScores.length === 0) return null;
  const entries = speciesScores.map(extractSpeciesEntry).filter((e): e is NonNullable<typeof e> => e !== null);
  if (entries.length === 0) return null;
  const withScore = entries.filter((e) => e.score !== null);
  const best = withScore.length > 0
    ? withScore.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a))
    : entries[0];
  return best.species;
}

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

function dayWindow(day: FishingDay): [number, number] | null {
  if (day.periods.length === 0) return null;
  const start = new Date(day.periods[0].periodStart).getTime();
  const end = new Date(day.periods[day.periods.length - 1].periodEnd).getTime();
  if (!isFinite(start) || !isFinite(end) || end <= start) return null;
  return [start, end];
}

/** moonIllumination may arrive as a 0–1 fraction or a 0–100 percentage
 *  depending on provider; normalize defensively before formatting. */
function formatIllumination(value: number, locale: string): string {
  const fraction = value > 1 ? value / 100 : value;
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
}

function pressureTrendDirection(tendency: number | null): 'up' | 'down' | 'steady' | null {
  if (tendency === null) return null;
  if (tendency > 0) return 'up';
  if (tendency < 0) return 'down';
  return 'steady';
}

// ---------------------------------------------------------------------------
// Shared small pieces — same local pattern as BoatingTab.tsx / BeachSafetyTab.tsx
// ---------------------------------------------------------------------------

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-glass rounded-xl ring-1 ring-foreground/10 p-[var(--card-pad)] flex flex-col gap-3">
      <h3 className="font-semibold text-foreground" style={{ fontSize: 'var(--text-card-title)' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
        {label}
      </dt>
      <dd
        className="text-foreground font-semibold"
        style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
      >
        {value}
        {unit && (
          <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}

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
// ScoreBar — horizontal proportional bar for the Conditions Breakdown
// ---------------------------------------------------------------------------

function ScoreBar({ label, score, locale }: { label: string; score: number; locale: string }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0 w-28 truncate" style={{ fontSize: 'var(--text-label)' }}>
        {label}
      </span>
      <div
        role="img"
        aria-label={`${label}: ${formatNumber(pct, 0, locale)}`}
        className="flex-1 h-2 rounded-full bg-muted overflow-hidden"
      >
        <div className={`h-full rounded-full ${scoreFillClass(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`shrink-0 w-9 text-right font-semibold ${scoreTextClass(pct)}`}
        style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}
      >
        {formatNumber(pct, 0, locale)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeriodGrid — 3-day forecast as a semantic table (day rows × period cols)
// ---------------------------------------------------------------------------

function PeriodGrid({ days, locale, stationTz, t }: { days: FishingDay[]; locale: string; stationTz: string; t: TFn }) {
  const headerDay = useMemo(
    () => days.reduce((longest, d) => (d.periods.length > longest.periods.length ? d : longest), days[0]),
    [days],
  );
  const columnCount = headerDay?.periods.length ?? 0;

  if (columnCount === 0) return null;

  return (
    <Panel title={t('fishing.periodGrid')}>
      <div className="overflow-x-auto">
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
              return (
                <tr key={day.date} className={rowIdx % 2 === 1 ? 'bg-muted/30' : undefined}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[rgb(var(--card-glass))] text-left p-2 align-top whitespace-nowrap font-semibold text-foreground"
                  >
                    {formatShortDayOfWeek(dateObj, locale, stationTz)}
                    <br />
                    <span className="text-muted-foreground font-normal" style={{ fontSize: 'var(--text-micro)' }}>
                      {formatMonthDay(dateObj, locale, stationTz)}
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
                    return (
                      <td key={colIdx} className={`p-2 align-top rounded-md ${scoreBgClass(period.overallScore)}`}>
                        <div className="flex flex-col gap-0.5 min-w-[4.5rem]">
                          <span
                            className={`font-bold ${scoreTextClass(period.overallScore)}`}
                            style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
                          >
                            {formatNumber(Math.round(period.overallScore), 0, locale)}
                          </span>
                          {top && (
                            <span className="text-foreground truncate" style={{ fontSize: 'var(--text-micro)' }}>
                              {top}
                            </span>
                          )}
                          {(isMajor || isMinor) && (
                            <span className="inline-flex items-center gap-0.5 text-foreground">
                              <MoonStars
                                aria-hidden="true"
                                focusable="false"
                                weight={isMajor ? 'fill' : 'regular'}
                                className="size-[18px]"
                              />
                              <span className="sr-only">{isMajor ? t('fishing.majorPeriod') : t('fishing.minorPeriod')}</span>
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// SolunarTimeline — 24h horizontal bar for major/minor periods + moon times
// ---------------------------------------------------------------------------

function SolunarTimeline({ day, locale, stationTz, t }: { day: FishingDay; locale: string; stationTz: string; t: TFn }) {
  // Named timeWindow (not `window`) — that identifier would shadow the
  // global DOM window object throughout this component's scope.
  const timeWindow = dayWindow(day);
  const solunar = day.solunar;

  const markers = useMemo(() => {
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

  const moonriseInWindow = solunar.moonrise && timeWindow
    ? new Date(solunar.moonrise).getTime() >= timeWindow[0] && new Date(solunar.moonrise).getTime() <= timeWindow[1]
    : false;
  const moonsetInWindow = solunar.moonset && timeWindow
    ? new Date(solunar.moonset).getTime() >= timeWindow[0] && new Date(solunar.moonset).getTime() <= timeWindow[1]
    : false;

  return (
    <Panel title={t('fishing.solunar')}>
      {/* dl/dt/dd (not a colon-joined string) — label/value pairing must not
          assume any particular punctuation or word order across locales
          (rules/coding.md §6.1). */}
      <dl className="flex flex-wrap gap-x-6 gap-y-1" style={{ fontSize: 'var(--text-body)' }}>
        <div className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">{t('fishing.moonPhase')}</dt>
          <dd className="text-foreground font-semibold">{solunar.moonPhase}</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">{t('fishing.illumination')}</dt>
          <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {formatIllumination(solunar.moonIllumination, locale)}
          </dd>
        </div>
        {solunar.moonrise && (
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{t('fishing.moonrise')}</dt>
            <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
              {formatTime(new Date(solunar.moonrise), locale, stationTz)}
            </dd>
          </div>
        )}
        {solunar.moonset && (
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{t('fishing.moonset')}</dt>
            <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
              {formatTime(new Date(solunar.moonset), locale, stationTz)}
            </dd>
          </div>
        )}
      </dl>

      {timeWindow && (
        <>
          <div
            role="img"
            aria-label={t('fishing.solunarTimelineAriaLabel')}
            className="relative h-6 rounded-md bg-muted overflow-hidden"
          >
            {markers.map((m) => (
              <div
                key={m.id}
                className={m.kind === 'major' ? 'absolute top-0.5 bottom-0.5 rounded-sm bg-primary' : 'absolute top-1.5 bottom-1.5 rounded-sm bg-primary/50'}
                style={{ left: `${m.left}%`, width: `${m.width}%` }}
              />
            ))}
            {moonriseInWindow && solunar.moonrise && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                style={{ left: `${((new Date(solunar.moonrise).getTime() - timeWindow[0]) / (timeWindow[1] - timeWindow[0])) * 100}%` }}
              />
            )}
            {moonsetInWindow && solunar.moonset && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                style={{ left: `${((new Date(solunar.moonset).getTime() - timeWindow[0]) / (timeWindow[1] - timeWindow[0])) * 100}%` }}
              />
            )}
          </div>

          <div className="flex items-center gap-4" style={{ fontSize: 'var(--text-micro)' }}>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-3 h-2 rounded-sm bg-primary" aria-hidden="true" />
              {t('fishing.majorPeriod')}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-3 h-2 rounded-sm bg-primary/50" aria-hidden="true" />
              {t('fishing.minorPeriod')}
            </span>
          </div>

          {/* sr-only fallback data table for the visual timeline (coding.md §5.5) */}
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
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// SpeciesTable — semantic table of species activity for the current period
// ---------------------------------------------------------------------------

function SpeciesTable({ period, species, locale, t }: { period: FishingForecast | null; species: string[]; locale: string; t: TFn }) {
  const entries = useMemo(() => {
    if (!period?.speciesScores || period.speciesScores.length === 0) return [];
    return period.speciesScores.map(extractSpeciesEntry).filter((e): e is NonNullable<typeof e> => e !== null);
  }, [period]);

  return (
    <Panel title={t('fishing.speciesTable')}>
      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: 'var(--text-body)' }}>
            <caption className="sr-only">{t('fishing.speciesTableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left p-2" style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  {t('fishing.species')}
                </th>
                <th scope="col" className="text-left p-2" style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  {t('fishing.activity')}
                </th>
                <th scope="col" className="text-right p-2" style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  {t('fishing.score')}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.species}-${i}`} className={i % 2 === 1 ? 'bg-muted/30' : undefined}>
                  <td className="p-2 text-foreground">{e.species}</td>
                  <td className="p-2 text-foreground">{e.activity ?? '—'}</td>
                  <td className="p-2 text-right font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                    {e.score !== null ? formatNumber(Math.round(e.score), 0, locale) : '—'}
                  </td>
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
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// ConditionsBreakdown — 5 ScoreBars for the current period
// ---------------------------------------------------------------------------

function ConditionsBreakdown({ period, locale, t }: { period: FishingForecast | null; locale: string; t: TFn }) {
  if (!period) return null;
  return (
    <Panel title={t('fishing.conditions')}>
      <div className="flex flex-col gap-2">
        <ScoreBar label={t('fishing.pressureScore')} score={period.pressureScore} locale={locale} />
        <ScoreBar label={t('fishing.tideScore')} score={period.tideScore} locale={locale} />
        <ScoreBar label={t('fishing.solunarScore')} score={period.solunarScore} locale={locale} />
        <ScoreBar label={t('fishing.waterTempScore')} score={period.waterTempScore} locale={locale} />
        <ScoreBar label={t('fishing.timeofdayScore')} score={period.timeofdayScore} locale={locale} />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// WindSwellContent — display-only, NOT scored. Renders bare content (no
// Panel wrapper) so it can be embedded inside the merged Conditions panel
// alongside the barometric pressure block (T1.5.4).
// ---------------------------------------------------------------------------

function WindSwellContent({ period, units, locale, t }: { period: FishingForecast | null; units: UnitsBlock | undefined; locale: string; t: TFn }) {
  if (!period) return null;
  return (
    <>
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>{t('fishing.windSwell')}</p>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <StatTile
          label={t('windSpeed')}
          value={period.windSpeed !== null ? formatValue(period.windSpeed, 'wind', locale) : '—'}
          unit={period.windSpeed !== null ? (units?.windSpeed ?? '') : undefined}
        />
        <StatTile
          label={t('fishing.windGust')}
          value={period.windGust !== null ? formatValue(period.windGust, 'wind', locale) : '—'}
          unit={period.windGust !== null ? (units?.windGust ?? units?.windSpeed ?? '') : undefined}
        />
        <StatTile
          label={t('fishing.direction')}
          value={period.windDirection !== null ? formatValue(period.windDirection, 'degrees', locale) : '—'}
          unit={period.windDirection !== null ? '°' : undefined}
        />
        <StatTile
          label={t('fishing.swellHeight')}
          value={period.swellHeight !== null ? formatValue(period.swellHeight, 'default', locale) : '—'}
          unit={period.swellHeight !== null ? (units?.swellHeight ?? '') : undefined}
        />
        <StatTile
          label={t('fishing.swellPeriod')}
          value={period.swellPeriod !== null ? formatValue(period.swellPeriod, 'default', locale) : '—'}
          unit={period.swellPeriod !== null ? (units?.swellPeriod ?? 's') : undefined}
        />
      </dl>
    </>
  );
}

// ---------------------------------------------------------------------------
// HabitatFeatures — CUDEM habitat feature list
// ---------------------------------------------------------------------------

function HabitatFeatures({ features, t }: { features: string[]; t: TFn }) {
  if (features.length === 0) return null;
  return (
    <Panel title={t('fishing.habitat')}>
      <ul className="flex flex-col gap-1.5">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
            <MapPin aria-hidden="true" focusable="false" className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
            {f}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// FishingTab — main export
// ---------------------------------------------------------------------------

export function FishingTab({ locationId, alerts = [] }: FishingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  const { data, units, loading, error, refetch } = useFishingDetail(locationId);
  const { data: marineBundle, units: marineUnits, loading: pressureLoading } = useMarineDetail(locationId);
  const observation = marineBundle?.observation ?? null;
  const pressureUnit = marineUnits?.pressure ?? 'mb';

  // Whole-tab loading state — fishing data is foundational to every panel below.
  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">{t('fishing.loading')}</span>
        <TileSkeleton className="h-64" />
        <TileSkeleton className="h-40" />
        <TileSkeleton className="h-48" />
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

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Activity-relevant alerts — top, prominent (consistent with the
          other three activity tabs; DASHBOARD-MANUAL §12 lists this last
          for fishing but doesn't say otherwise, and the sibling tabs both
          place their alert banner first). */}
      <AlertsPanel alerts={alerts} />

      {/* 2. 3-day period grid */}
      {data.days.length > 0 && <PeriodGrid days={data.days} locale={locale} stationTz={stationTz} t={t} />}

      {/* 3. Conditions breakdown — score bars. Moved directly after the
          period grid (T1.8.2) so anglers see the scoring rationale for the
          forecast right below the forecast itself, instead of scrolling
          past the solunar calendar, tide chart, and pressure panel first. */}
      <ConditionsBreakdown period={currentPeriod} locale={locale} t={t} />

      {/* 4. Solunar calendar */}
      {data.days[0] && <SolunarTimeline day={data.days[0]} locale={locale} stationTz={stationTz} t={t} />}

      {/* 5. Tide chart — standalone, 72h (shared component) */}
      <Panel title={t('fishing.tides')}>
        <TideChart
          predictions={data.tidePredictions}
          locale={locale}
          stationTz={stationTz}
          heightUnit={tideHeightUnit}
          ariaLabel={t('fishing.tideChartAriaLabel', { location: data.locationName })}
        />
      </Panel>

      {/* 6. Conditions panel — barometric pressure + wind/swell consolidated
          into one panel (T1.5.4) instead of two single-purpose panels. */}
      <Panel title={t('fishing.currentConditions')}>
        {pressureLoading ? (
          <TileSkeleton className="h-12" />
        ) : observation?.pressure === null || observation?.pressure === undefined ? (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('fishing.noPressureData')}</p>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <dl>
              <StatTile label={t('fishing.pressure')} value={formatValue(observation.pressure, 'barometer', locale)} unit={pressureUnit} />
            </dl>
            <PressureTrend tendency={observation.pressureTendency ?? null} t={t} />
          </div>
        )}
        <WindSwellContent period={currentPeriod} units={units} locale={locale} t={t} />
      </Panel>

      {/* 7. Species forecast table */}
      <SpeciesTable period={currentPeriod} species={data.species} locale={locale} t={t} />

      {/* 8. CUDEM habitat features */}
      <HabitatFeatures features={data.habitatFeatures} t={t} />
    </div>
  );
}

export default FishingTab;
