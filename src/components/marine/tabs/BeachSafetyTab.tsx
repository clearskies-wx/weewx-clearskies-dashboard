// BeachSafetyTab.tsx — Beach Safety activity tab content (DASHBOARD-MANUAL
// §12 "Tab content — Beach Safety (F24 redesign)", T9.3). Itemized hazard
// indicators (Beach Report flag pattern) — NO overall "safe/caution/
// dangerous" badge. The API always returns `safetyLevel: null` (T9.1); the
// dashboard presents individual hazards and lets the visitor evaluate,
// rather than collapsing them into a composite rating.
//
// Panel order (top to bottom), matching DASHBOARD-MANUAL §12 exactly:
//   1. Alerts (AlertsPanel, shared, unchanged)
//   2. Beach Conditions — itemized hazard rows (Rip Current Risk, UV Index),
//      each show-when-available with a color-coded badge that always pairs
//      color with a text label (rules/coding.md §5.1 — never color-only),
//      followed by a stat-tile grid (wave height, wave period, wind speed +
//      direction, water temperature + comfort badge) built from the shared
//      MarineStatTile, and a storm-surge badge when present. No composite
//      "Dangerous" badge anywhere in this card.
//   3. Tide Forecast — TideChart (shared, standalone, 72h)
//   4. Coastal Flooding Risk — show-when-available (NWPS v1.5 total water
//      level / wave runup)
//   5. Local Resources — show-when-available (operator-configured external
//      links)
//
// Removed from the prior implementation (DASHBOARD-MANUAL §12 F24): the
// `SafetyIndicator` component and its "Safe/Caution/Dangerous" badge, the
// standalone `RipCurrentPanel`/`WaterTempPanel`/`UVIndexPanel` components,
// and the local `Panel`/`StatTile` functions — all consolidated into the
// Beach Conditions card using the shared Card/CardHeader/CardTitle/
// CardContent system + MarineStatTile (DESIGN-MANUAL; same recipe as
// BoatingTab.tsx/FishingTab.tsx). The removed source files are left in
// place, unimported, as documented dead code — their cleanup is a separate
// task.
//
// Storm surge reads `data.stormSurgeLevel` directly off the beach-safety
// detail payload (BeachSafetyDetailData carries its own copy per ADR-091
// Decision 4 / T4.2) rather than a second `useTideDetail()` call — the tide
// bundle isn't otherwise needed here, since `tidePredictions`/`waterLevels`
// also live on the beach-safety payload itself.
//
// A11y (rules/coding.md §5):
//   - Every card heading is a real <h3> via CardTitle as="h3" (document
//     order sibling of the tab/accordion header above it, no skipped
//     levels).
//   - Rip current and UV rows pair color with an icon AND a text label —
//     never color-only (coding.md §5.1). Same for the water-temp comfort
//     badge and the storm-surge badge.
//   - TideChart: role="img" wrapper + sr-only data table (shared component,
//     unchanged).

import { Wind, Waves, Thermometer, SunDim, Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useBeachSafetyDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { cardinalFromDegrees } from '../../../utils/wind';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { MarineStatTile } from '../shared/MarineStatTile';

interface BeachSafetyTabProps {
  locationId: string;
}

// ---------------------------------------------------------------------------
// Shared small pieces — same recipe as BoatingTab.tsx/FishingTab.tsx (each
// activity tab defines its own local copy; there is no generic cross-tab
// skeleton/error component in shared/ to reuse).
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

// ---------------------------------------------------------------------------
// Rip Current Risk — itemized hazard row. Badge color + text label +
// guidance text; never color-only (coding.md §5.1). Show-when-available:
// renders nothing when ripCurrentRisk is null.
// ---------------------------------------------------------------------------

type RipTier = 'low' | 'moderate' | 'high';

const RIP_BADGE_CLASS: Record<RipTier, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  moderate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

function isRipTier(value: string): value is RipTier {
  return value === 'low' || value === 'moderate' || value === 'high';
}

function RipCurrentRow({ risk, t }: { risk: string | null; t: TFunction }) {
  if (risk === null) return null;
  const key = risk.toLowerCase();
  const known = isRipTier(key);
  const badgeClass = known ? RIP_BADGE_CLASS[key as RipTier] : 'bg-muted text-foreground';
  // Tier label reuses the shared qualitative.* table (same low/moderate/high
  // strings the surfing tab's rip-current-risk row and the dead
  // RipCurrentPanel.tsx already draw from) — DRY per rules/coding.md §3.
  const label = known ? t(`qualitative.${key}`) : risk;
  const guidance = known ? t(`beachSafety.ripCurrent.guidance.${key}`) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
        {t('beachSafety.ripCurrent.label')}
      </p>
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded px-2.5 py-1 font-semibold ${badgeClass}`}
        style={{ fontSize: 'var(--text-label)' }}
      >
        <Warning aria-hidden="true" focusable="false" className="size-4 shrink-0" />
        {label}
      </span>
      {guidance && (
        <p className="text-foreground" style={{ fontSize: 'var(--text-body)' }}>
          {guidance}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UV Index — itemized hazard row. EPA UV Index scale: 0-2 low, 3-5
// moderate, 6-7 high, 8-10 very high, 11+ extreme. Numeric value + tier
// badge + SPF recommendation + guidance text; never color-only. Show-when-
// available: renders nothing when uvIndex is null.
// ---------------------------------------------------------------------------

type UvTier = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

const UV_BADGE_CLASS: Record<UvTier, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  veryHigh: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  extreme: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
};

function uvTierFor(uvIndex: number): UvTier {
  if (uvIndex <= 2) return 'low';
  if (uvIndex <= 5) return 'moderate';
  if (uvIndex <= 7) return 'high';
  if (uvIndex <= 10) return 'veryHigh';
  return 'extreme';
}

function UvIndexRow({ uvIndex, locale, t }: { uvIndex: number | null; locale: string; t: TFunction }) {
  if (uvIndex === null) return null;
  const tier = uvTierFor(uvIndex);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
        {t('beachSafety.uv.label')}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="font-semibold text-foreground"
          style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
        >
          {formatValue(uvIndex, 'uv', locale)}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-semibold ${UV_BADGE_CLASS[tier]}`}
          style={{ fontSize: 'var(--text-label)' }}
        >
          <SunDim aria-hidden="true" focusable="false" className="size-4 shrink-0" />
          {t(`beachSafety.uv.tiers.${tier}`)}
        </span>
      </div>
      <p className="text-foreground font-medium" style={{ fontSize: 'var(--text-body)' }}>
        {t(`beachSafety.uv.spf.${tier}`)}
      </p>
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t(`beachSafety.uv.guidance.${tier}`)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Water temperature comfort badge — pairs the MarineStatTile value with a
// color + text comfort label; never color-only. Mirrors the dead
// WaterTempPanel.tsx's COMFORT_CONFIG mapping and label keys.
// ---------------------------------------------------------------------------

const COMFORT_BADGE_CLASS: Record<string, string> = {
  comfortable: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  cool: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  cold: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  dangerous: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

const COMFORT_LABEL_KEY: Record<string, string> = {
  comfortable: 'beachSafety.comfortable',
  cool: 'beachSafety.cool',
  cold: 'beachSafety.cold',
  dangerous: 'beachSafety.hypothermia',
};

function ComfortBadge({ comfortLevel, t }: { comfortLevel: string | null; t: TFunction }) {
  if (comfortLevel === null) return null;
  const key = comfortLevel.toLowerCase();
  const badgeClass = COMFORT_BADGE_CLASS[key];
  const labelKey = COMFORT_LABEL_KEY[key];
  if (!badgeClass || !labelKey) return null;
  return (
    <span
      className={`inline-flex w-fit items-center rounded px-2 py-0.5 font-semibold ${badgeClass}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      {t(labelKey)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Storm surge badge — icon + text label + color, never color-only. Same
// recipe as BoatingTab.tsx's local StormSurgeBadge (duplicated per-tab, no
// shared component for this yet — matches that file's own precedent
// comment).
// ---------------------------------------------------------------------------

type StormSurgeLevel = 'elevated' | 'depressed' | 'significant' | 'storm_surge';

function StormSurgeBadge({ level, t }: { level: StormSurgeLevel; t: TFunction }) {
  const colorClasses =
    level === 'storm_surge'
      ? 'bg-destructive/15 text-destructive'
      : level === 'significant'
        ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
        : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400';

  const labelKey =
    level === 'storm_surge'
      ? 'beachSafety.stormSurgeActive'
      : level === 'significant'
        ? 'beachSafety.stormSurgeSignificant'
        : level === 'depressed'
          ? 'beachSafety.stormSurgeDepressed'
          : 'beachSafety.stormSurgeElevated';

  return (
    <div
      role="status"
      className={`inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 font-semibold ${colorClasses}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      <span aria-hidden="true">{level === 'storm_surge' ? '⚠' : '▲'}</span>
      <span className="sr-only">{t('beachSafety.stormSurge')}: </span>
      {t(labelKey)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BeachSafetyTab({ locationId }: BeachSafetyTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data, units, loading, error, refetch } = useBeachSafetyDetail(locationId);
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">{t('beachSafety.title')}</span>
        <TileSkeleton className="h-16" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <InlineError message={t('unableToLoad')} onRetry={refetch} retryLabel={tCommon('retry')} />;
  }

  if (!data) return null;

  const { assessment, nwpsV15, tidePredictions, waterLevels, externalLinks, locationName, stormSurgeLevel } = data;

  const waveHeightUnit = units?.waveHeight ?? 'ft';
  const windSpeedUnit = units?.windSpeed ?? 'kn';
  const tempUnit = units?.waterTemp ?? units?.temperature ?? '';

  const windDirCardinal = cardinalFromDegrees(assessment.windDirection);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : null;

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Safety alerts banner — top, most prominent */}
      <AlertsPanel alerts={assessment.activeAlerts.map((h) => ({ headline: h, alertType: 'beachHazard' }))} />

      {/* 2. Beach Conditions — itemized hazard rows (rip current, UV), each
          show-when-available, followed by a stat-tile grid and a storm
          surge badge. NO composite safe/caution/dangerous badge. */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('beachSafety.conditions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RipCurrentRow risk={assessment.ripCurrentRisk} t={t} />
          <UvIndexRow uvIndex={assessment.uvIndex} locale={locale} t={t} />

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <MarineStatTile
              icon={<Waves size={16} aria-hidden="true" focusable="false" />}
              label={t('waveHeight')}
              value={formatValue(assessment.waveHeight, 'default', locale)}
              unit={waveHeightUnit}
            />
            <MarineStatTile
              label={t('beachSafety.wavePeriod')}
              value={formatValue(assessment.wavePeriod, 'default', locale)}
              unit={t('beachSafety.secondsAbbr')}
            />
            <MarineStatTile
              icon={<Wind size={16} aria-hidden="true" focusable="false" />}
              label={t('windSpeed')}
              value={formatValue(assessment.windSpeed, 'wind', locale)}
              unit={windSpeedUnit}
            />
            <MarineStatTile label={t('beachSafety.direction')} value={windDirLabel ?? '—'} />
            <div className="flex flex-col gap-1">
              <MarineStatTile
                icon={<Thermometer size={16} aria-hidden="true" focusable="false" />}
                label={t('waterTemp')}
                value={formatValue(assessment.waterTemp, 'temperature', locale)}
                unit={tempUnit}
              />
              <ComfortBadge comfortLevel={assessment.comfortLevel} t={t} />
            </div>
          </dl>

          {stormSurgeLevel !== null && <StormSurgeBadge level={stormSurgeLevel} t={t} />}
        </CardContent>
      </Card>

      {/* 3. Tide chart — standalone, 72h (shared component) */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('beachSafety.tides')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TideChart
            predictions={tidePredictions}
            waterLevels={waterLevels}
            locale={locale}
            stationTz={stationTz}
            heightUnit={waveHeightUnit}
            ariaLabel={t('beachSafety.tidesAriaLabel', { location: locationName })}
          />
        </CardContent>
      </Card>

      {/* 4. NWPS v1.5 coastal flooding risk — show-when-available */}
      {nwpsV15 !== null && (nwpsV15.totalWaterLevel !== null || nwpsV15.waveRunup !== null) && (
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h3">{t('beachSafety.coastalRisk')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {nwpsV15.totalWaterLevel !== null && (
                <MarineStatTile
                  label={t('beachSafety.totalWaterLevel')}
                  value={formatValue(nwpsV15.totalWaterLevel, 'default', locale)}
                  unit={waveHeightUnit}
                />
              )}
              {nwpsV15.waveRunup !== null && (
                <MarineStatTile
                  label={t('beachSafety.waveRunup')}
                  value={formatValue(nwpsV15.waveRunup, 'default', locale)}
                  unit={waveHeightUnit}
                />
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* 5. External links — show-when-available */}
      {externalLinks.length > 0 && (
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h3">{t('beachSafety.resources')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
              {externalLinks.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                    style={{ fontSize: 'var(--text-body)' }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BeachSafetyTab;
