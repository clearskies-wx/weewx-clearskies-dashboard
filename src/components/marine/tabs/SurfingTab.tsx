// SurfingTab.tsx — Full data ensemble for the Surfing activity tab
// (Phase 7 T7.3, DASHBOARD-MANUAL §12 "Tab content per activity"). Vertical
// stack: 72h forecast timeline (star ratings) → wave face height chart →
// swell breakdown (spectral components) → wind quality → tide chart
// (standalone, 72h, shared component) → beach alignment diagram → general
// weather → activity-relevant alerts.
//
// Data source: useSurfDetail(locationId) (/surf/{id}) — a single bundle
// covering forecast, zoneForecast (NWS Surf Zone Forecast), spectral
// components, and tide predictions. No separate tide fetch is needed (unlike
// BoatingTab/BeachSafetyTab) since SurfDetailData already carries
// tidePredictions.
//
// Panel/TileSkeleton/InlineError/StatTile follow the same conventions
// established by BoatingTab.tsx (T7.2) and BeachSafetyTab.tsx (T7.5) so all
// four marine activity tabs read as one system.
//
// A11y (rules/coding.md §5):
//   - Every panel heading is a real <h3> (siblings of the tab/accordion h3
//     header above, not nested — no skipped levels).
//   - Star ratings: Unicode glyphs are aria-hidden; the wrapping element
//     carries a translated aria-label ("N of 5 stars") — glyphs alone are
//     not accessible text.
//   - Color is never the only signal: quality/wind-quality/rip-current
//     color coding is always paired with a translated text label.
//   - Charts: ChartContainer (role="img" + aria-label) + sr-only data table.
//   - Beach alignment compass: role="img" with a <title> summarizing the
//     dominant swell direction as text.
//   - Horizontal scroll strip uses the shared HorizontalScrollNav pattern
//     (DESIGN-MANUAL §11) — round buttons + keyboard-scrollable region.

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis } from 'recharts';
import { useSurfDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { ChartContainer } from '../../charts/chart-container';
import { HorizontalScrollNav } from '../../ui/horizontal-scroll-nav';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { buildHourTicks } from './shared/hour-ticks';
import type { SpectralWaveComponent, SurfForecast } from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurfingTabProps {
  locationId: string;
  /** Active marine-zone alert headlines for this location (from MarineLocationSummary.activeAlerts). */
  alerts?: string[];
}

// ---------------------------------------------------------------------------
// Shared small pieces (same recipe as BoatingTab.tsx / BeachSafetyTab.tsx)
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

// ---------------------------------------------------------------------------
// StarRating — Unicode ★/☆ glyphs, decorative; the wrapping <span> carries
// the translated accessible name (reuses the existing "qualitative.stars"
// key already used by marine.tsx's tab-header qualitative label).
// ---------------------------------------------------------------------------

function StarRating({ stars, t }: { stars: number; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const rounded = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    // role="img" is required here, not decorative flourish: a plain <span>
    // has an implicit ARIA role of "generic", and aria-label has no effect
    // on generic elements per the ARIA-in-HTML spec — axe-core's
    // aria-prohibited-attr rule flags this (confirmed live during T7.3
    // verification). "img" is a naming-container role, so the translated
    // "N of 5 stars" label actually reaches the accessibility tree.
    <span
      role="img"
      aria-label={t('qualitative.stars', { count: rounded })}
      className="text-foreground"
      style={{ fontSize: 'var(--text-label)', letterSpacing: '0.05em' }}
    >
      <span aria-hidden="true">{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</span>
    </span>
  );
}

/** 4-5 stars → green (great), 3 → amber (fair), 1-2 → red (poor). Color is
 *  always paired with the star glyphs + qualityLabel text — never alone. */
function qualityColorClasses(stars: number): string {
  const rounded = Math.round(stars);
  if (rounded >= 4) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (rounded === 3) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

// ---------------------------------------------------------------------------
// 1. 72-hour forecast timeline — horizontal scroll strip of star-rated cells
// ---------------------------------------------------------------------------

function ForecastTimeline({
  forecast,
  locale,
  stationTz,
  t,
}: {
  forecast: SurfForecast[];
  locale: string;
  stationTz: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (forecast.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noForecastData')}
      </p>
    );
  }

  return (
    <HorizontalScrollNav ariaLabel={t('surfing.forecastTimelineAriaLabel')}>
      <div className="flex gap-2 px-1 py-1">
        {forecast.map((entry) => (
          <div
            key={entry.time}
            className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 shrink-0 min-w-[5.5rem] ${qualityColorClasses(entry.qualityStars)}`}
          >
            <span className="font-semibold" style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}>
              {formatTime(new Date(entry.time), locale, stationTz)}
            </span>
            <StarRating stars={entry.qualityStars} t={t} />
            <span className="text-center" style={{ fontSize: 'var(--text-micro)' }}>
              {entry.qualityLabel}
            </span>
          </div>
        ))}
      </div>
    </HorizontalScrollNav>
  );
}

// ---------------------------------------------------------------------------
// 2. Wave face height chart — the post-supplement breaking height (NOT raw
// offshore Hs), which is the number surfers actually care about.
// ---------------------------------------------------------------------------

function WaveFaceHeightChart({
  forecast,
  locale,
  stationTz,
  heightUnit,
  ariaLabel,
  t,
}: {
  forecast: SurfForecast[];
  locale: string;
  stationTz: string;
  heightUnit: string;
  ariaLabel: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const points = useMemo(
    () =>
      forecast
        .map((f) => ({ ts: new Date(f.time).getTime(), height: f.waveHeightAtBreak }))
        .sort((a, b) => a.ts - b.ts),
    [forecast],
  );

  if (points.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noForecastData')}
      </p>
    );
  }

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const ticks = buildHourTicks(minTs, maxTs);
  const tickFormatter = (ts: number) => formatTime(new Date(ts), locale, stationTz);

  return (
    <>
      <ChartContainer height={220} ariaLabel={ariaLabel}>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
          <defs>
            <linearGradient id="surfingWaveFaceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" style={{ stopColor: 'var(--chart-2)', stopOpacity: 0.4 }} />
              <stop offset="95%" style={{ stopColor: 'var(--chart-2)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            domain={[minTs, maxTs]}
            ticks={ticks}
            tickFormatter={tickFormatter}
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            height={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={36}
            label={{
              value: heightUnit,
              angle: -90,
              position: 'insideLeft',
              style: { fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--muted-foreground)' },
            }}
          />
          <Area
            type="monotone"
            dataKey="height"
            stroke="var(--chart-2)"
            fill="url(#surfingWaveFaceGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
        </AreaChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('surfing.srTimeColumn')}</th>
            <th scope="col">{t('surfing.srWaveFaceHeightColumn', { unit: heightUnit })}</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((f, i) => (
            <tr key={`${f.time}-${i}`}>
              <td>{formatTime(new Date(f.time), locale, stationTz)}</td>
              <td>{formatValue(f.waveHeightAtBreak, 'default', locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Swell breakdown — spectral components, classification color-coded.
// ---------------------------------------------------------------------------

const CLASSIFICATION_COLOR: Record<string, string> = {
  groundswell: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  swell: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  wind_swell: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300',
};

function SwellBreakdown({
  components,
  locale,
  heightUnit,
  periodUnit,
  t,
  tCommon,
}: {
  components: SpectralWaveComponent[];
  locale: string;
  heightUnit: string;
  periodUnit: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  if (components.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noSpectralData')}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 list-none p-0 m-0">
      {components.map((c, i) => {
        const classKey = c.classification in CLASSIFICATION_COLOR ? c.classification : 'swell';
        const cardinal = cardinalFromDegrees(c.direction);
        const cardinalLabel = cardinal ? tCommon(`directions.${cardinal}`) : '—';
        return (
          <li key={i} className={`rounded-lg p-3 flex flex-col gap-1.5 ${CLASSIFICATION_COLOR[classKey]}`}>
            <span className="font-semibold" style={{ fontSize: 'var(--text-label)' }}>
              {t(`surfing.classification.${classKey}`)}
            </span>
            <dl className="grid grid-cols-3 gap-1" style={{ fontSize: 'var(--text-micro)' }}>
              <div className="flex flex-col">
                <dt>{t('surfing.height')}</dt>
                <dd className="font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                  {formatValue(c.height, 'default', locale)} {heightUnit}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt>{t('surfing.period')}</dt>
                <dd className="font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                  {formatValue(c.period, 'default', locale)} {periodUnit}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt>{t('surfing.direction')}</dt>
                <dd className="font-semibold">{cardinalLabel}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 4. Wind quality panel — offshore (ideal, green) / cross (amber) / onshore
// (poor, red), always paired with the translated label text.
// ---------------------------------------------------------------------------

const WIND_QUALITY_COLOR: Record<string, string> = {
  offshore: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cross_offshore: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cross: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cross_onshore: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  onshore: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function WindQualityBadge({ quality, t }: { quality: string | null; t: (key: string) => string }) {
  if (quality === null) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noData')}
      </p>
    );
  }
  const key = quality in WIND_QUALITY_COLOR ? quality : 'cross';
  return (
    <span
      className={`inline-flex w-fit items-center rounded px-2.5 py-1 font-semibold ${WIND_QUALITY_COLOR[key]}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      {t(`surfing.windQuality.${key}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 6. Beach alignment diagram — static compass rose with an arrow overlay
// pointing at the dominant swell direction (highest-energy spectral
// component, falling back to the primary forecast direction).
// ---------------------------------------------------------------------------

function BeachAlignmentDiagram({
  directionDeg,
  t,
  tCommon,
}: {
  directionDeg: number | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  if (directionDeg === null) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noDirectionData')}
      </p>
    );
  }

  const cardinal = cardinalFromDegrees(directionDeg);
  const cardinalLabel = cardinal ? tCommon(`directions.${cardinal}`) : '—';
  const title = t('surfing.beachAlignmentAriaLabel', { direction: cardinalLabel, degrees: Math.round(directionDeg) });

  const cx = 60;
  const cy = 60;
  const r = 44;
  const angleRad = (directionDeg * Math.PI) / 180; // 0deg = N (up), clockwise
  const tipX = cx + r * Math.sin(angleRad);
  const tipY = cy - r * Math.cos(angleRad);

  const cardinalTicks: Array<{ deg: number; code: string }> = [
    { deg: 0, code: 'N' },
    { deg: 90, code: 'E' },
    { deg: 180, code: 'S' },
    { deg: 270, code: 'W' },
  ];

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label={title}>
        <title>{title}</title>
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.35} />
        {cardinalTicks.map(({ deg, code }) => {
          const rad = (deg * Math.PI) / 180;
          const lx = cx + (r + 16) * Math.sin(rad);
          const ly = cy - (r + 16) * Math.cos(rad) + 4;
          return (
            <text
              key={code}
              x={lx}
              y={ly}
              textAnchor="middle"
              style={{ fontFamily: 'var(--font-chart)', fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
            >
              {tCommon(`directions.${code}`)}
            </text>
          );
        })}
        <defs>
          <marker id="surfingSwellArrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--chart-2)" />
          </marker>
        </defs>
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke="var(--chart-2)"
          strokeWidth={3}
          markerEnd="url(#surfingSwellArrowhead)"
        />
        <circle cx={cx} cy={cy} r={3} fill="var(--chart-2)" />
      </svg>
      <p className="text-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {title}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SurfingTab
// ---------------------------------------------------------------------------

export function SurfingTab({ locationId, alerts = [] }: SurfingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data, units, loading, error, refetch } = useSurfDetail(locationId);
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">
          {t('surfing.loading')}
        </span>
        <TileSkeleton className="h-24" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-32" />
        <TileSkeleton className="h-48" />
      </div>
    );
  }

  if (error) {
    return <InlineError message={t('surfing.unableToLoad')} onRetry={refetch} retryLabel={tCommon('retry')} />;
  }

  if (!data) return null;

  const { forecast, zoneForecast, spectralComponents, tidePredictions, locationName } = data;

  const heightUnit = units?.waveHeightAtBreak ?? units?.waveHeight ?? units?.height ?? 'ft';
  const periodUnit = units?.period ?? t('surfing.secondsAbbr');
  const tempUnit = units?.waterTemp ?? units?.temperature ?? '';

  const currentWindQuality = forecast[0]?.windQuality ?? null;

  // Dominant swell direction: highest-energy spectral component, falling
  // back to the primary forecast entry's direction field.
  const dominantDirection = dominantSwellDirection(spectralComponents, forecast);

  const ripRiskKey = zoneForecast?.ripCurrentRisk?.toLowerCase() ?? null;
  const isHighRipRisk = ripRiskKey === 'high';
  const hasHazardsText = !!zoneForecast?.hazardsText;
  const showZoneAlerts = isHighRipRisk || hasHazardsText;

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. 72-hour forecast timeline */}
      <Panel title={t('surfing.forecastTimelineTitle')}>
        <ForecastTimeline forecast={forecast} locale={locale} stationTz={stationTz} t={t} />
      </Panel>

      {/* 2. Wave face height chart */}
      <Panel title={t('surfing.waveFaceHeightTitle')}>
        <WaveFaceHeightChart
          forecast={forecast}
          locale={locale}
          stationTz={stationTz}
          heightUnit={heightUnit}
          ariaLabel={t('surfing.waveFaceHeightAriaLabel', { location: locationName })}
          t={t}
        />
      </Panel>

      {/* 3. Swell breakdown */}
      <Panel title={t('surfing.swellBreakdownTitle')}>
        <SwellBreakdown
          components={spectralComponents}
          locale={locale}
          heightUnit={heightUnit}
          periodUnit={periodUnit}
          t={t}
          tCommon={tCommon}
        />
      </Panel>

      {/* 4. Wind quality panel */}
      <Panel title={t('surfing.windQualityTitle')}>
        <WindQualityBadge quality={currentWindQuality} t={t} />
      </Panel>

      {/* 5. Tide chart — standalone, 72h (shared component) */}
      <Panel title={t('surfing.tideForecastTitle')}>
        <TideChart
          predictions={tidePredictions}
          locale={locale}
          stationTz={stationTz}
          heightUnit={heightUnit}
          ariaLabel={t('surfing.tideForecastAriaLabel', { location: locationName })}
        />
      </Panel>

      {/* 6. Beach alignment diagram */}
      <Panel title={t('surfing.beachAlignmentTitle')}>
        <BeachAlignmentDiagram directionDeg={dominantDirection} t={t} tCommon={tCommon} />
      </Panel>

      {/* 7. General weather — SurfZoneForecast carries no air-temperature
          field, so this panel surfaces the two general-conditions fields
          the bundle does provide (UV index, water temperature) rather than
          fabricating data DASHBOARD-MANUAL §12 doesn't back. */}
      {zoneForecast !== null && (zoneForecast.uvIndex !== null || zoneForecast.waterTemp !== null) && (
        <Panel title={t('surfing.generalWeatherTitle', { location: locationName })}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {zoneForecast.uvIndex !== null && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{t('surfing.uvIndex')}</dt>
                <dd className="text-foreground font-semibold" style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}>
                  {formatValue(zoneForecast.uvIndex, 'uv', locale)}
                </dd>
              </div>
            )}
            {zoneForecast.waterTemp !== null && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{t('waterTemp')}</dt>
                <dd className="text-foreground font-semibold" style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}>
                  {formatValue(zoneForecast.waterTemp, 'temperature', locale)}{tempUnit}
                </dd>
              </div>
            )}
          </dl>
        </Panel>
      )}

      {/* 8. Activity-relevant alerts — general marine-zone headlines, plus a
          prominent surf-specific banner when the NWS Surf Zone Forecast
          reports high rip current risk or hazards text. */}
      <AlertsPanel alerts={alerts} />
      {showZoneAlerts && (
        <div
          role={isHighRipRisk ? 'alert' : undefined}
          className="rounded-xl p-[var(--card-pad)] flex flex-col gap-2"
          style={{
            background: 'var(--alert-glass)',
            border: '1px solid var(--alert-border)',
            color: 'var(--alert-fg)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h3 className="font-semibold" style={{ fontSize: 'var(--text-card-title)' }}>
            {isHighRipRisk ? t('surfing.ripCurrentWarning') : t('alerts')}
          </h3>
          {isHighRipRisk && (
            <p style={{ fontSize: 'var(--text-body)' }}>
              {t('surfing.ripCurrentRiskLabel', { level: t(`surfing.ripCurrentRisk.${ripRiskKey}`) })}
            </p>
          )}
          {hasHazardsText && <p style={{ fontSize: 'var(--text-body)' }}>{zoneForecast!.hazardsText}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: dominant swell direction (highest-energy spectral component,
// falling back to the first forecast entry's direction field). Plain
// function, not a hook — SurfingTab calls it after its loading/error/no-data
// early returns, so it must not itself call useMemo/useState (Rules of
// Hooks — DASHBOARD-MANUAL §9 "React hooks constraint"). The input arrays
// are short (a handful of spectral components, 72 hourly forecast entries),
// so a plain reduce on every render is cheap enough that memoization isn't
// needed here.
// ---------------------------------------------------------------------------

function dominantSwellDirection(
  spectralComponents: SpectralWaveComponent[],
  forecast: SurfForecast[],
): number | null {
  if (spectralComponents.length > 0) {
    const dominant = spectralComponents.reduce((best, c) => (c.energy > best.energy ? c : best), spectralComponents[0]);
    return dominant.direction;
  }
  return forecast[0]?.direction ?? null;
}

export default SurfingTab;
