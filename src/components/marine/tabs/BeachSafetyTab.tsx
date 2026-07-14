// BeachSafetyTab.tsx — Full data ensemble for the Beach Safety activity tab
// (Phase 7 T7.5, DASHBOARD-MANUAL §12 "Tab content per activity"; consolidated
// per Phase 1 T1.5/T1.9). Vertical stack: safety alerts banner (top, most
// prominent) → Current Conditions (overall safety indicator at top, then
// sea state, water temp, wind, UV index, consolidated into one panel — no
// standalone visibility section) → rip current risk → tide chart → NWPS
// v1.5 coastal risk (show-when-available) → external links
// (show-when-available).
//
// Reuses the shared AlertsPanel/TideChart components from T7.2 (checked
// src/components/marine/tabs/shared/ before writing — see BoatingTab.tsx for
// the established consuming pattern this file mirrors) rather than forking
// duplicate chart/alert code (rules/coding.md §3 DRY).
//
// No water quality/bacterial counts, wildlife alerts, underwater visibility,
// or lightning sections — explicitly out of scope for v1 (T7.5 brief).

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useBeachSafetyDetail, useTideDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { cardinalFromDegrees } from '../../../utils/wind';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { SafetyIndicator } from './SafetyIndicator';
import { RipCurrentPanel } from './RipCurrentPanel';
import { WaterTempPanel } from './WaterTempPanel';
import { UVIndexPanel } from './UVIndexPanel';

interface BeachSafetyTabProps {
  locationId: string;
}

// ---------------------------------------------------------------------------
// Shared small pieces — same recipe as BoatingTab.tsx's Panel/TileSkeleton/
// InlineError (each activity tab defines its own local copy; there is no
// generic cross-tab Panel/skeleton/error component in shared/ to reuse).
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BeachSafetyTab({ locationId }: BeachSafetyTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data, units, loading, error, refetch } = useBeachSafetyDetail(locationId);
  const { data: station } = useStation();
  const { data: tide } = useTideDetail(locationId);
  const stationTz = station?.timezone ?? 'UTC';

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">{t('beachSafety.title')}</span>
        <TileSkeleton className="h-16" />
        <TileSkeleton className="h-24" />
        <TileSkeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <InlineError message={t('unableToLoad')} onRetry={refetch} retryLabel={tCommon('retry')} />;
  }

  if (!data) return null;

  const { assessment, nwpsV15, tidePredictions, waterLevels, externalLinks, locationName } = data;

  const waveHeightUnit = units?.waveHeight ?? 'ft';
  const windSpeedUnit = units?.windSpeed ?? 'kn';
  const tempUnit = units?.waterTemp ?? units?.temperature ?? '';

  const windDirCardinal = cardinalFromDegrees(assessment.windDirection);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : null;

  const seaStateInterpretation =
    assessment.safetyLevel === 'safe' || assessment.safetyLevel === 'caution' || assessment.safetyLevel === 'dangerous'
      ? t(`beachSafety.${assessment.safetyLevel}`)
      : null;

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Safety alerts banner — top, most prominent */}
      <AlertsPanel alerts={assessment.activeAlerts.map((h) => ({ headline: h, alertType: 'beachHazard' }))} />

      {/* 2. Current Conditions — safety indicator, sea state, water temp,
          wind, and UV index consolidated into one panel (T1.5.5) instead of
          five single-stat panels. The overall SafetyIndicator badge sits at
          the top since it's the single most important thing on this tab.
          No standalone visibility section — swimmers don't need nautical
          mile visibility (T1.5.5). */}
      <Panel title={t('beachSafety.currentConditions')}>
        <SafetyIndicator level={assessment.safetyLevel} t={t} />

        {tide?.stormSurgeLevel != null && (
          <div
            role="status"
            className={[
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
              tide.stormSurgeLevel === 'storm_surge'
                ? 'bg-destructive/15 text-destructive'
                : tide.stormSurgeLevel === 'significant'
                  ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
                  : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
            ].join(' ')}
          >
            <span aria-hidden="true">
              {tide.stormSurgeLevel === 'storm_surge' ? '⚠' : '▲'}
            </span>
            {t(
              tide.stormSurgeLevel === 'storm_surge'
                ? 'beachSafety.stormSurgeActive'
                : tide.stormSurgeLevel === 'significant'
                  ? 'beachSafety.stormSurgeSignificant'
                  : tide.stormSurgeLevel === 'depressed'
                    ? 'beachSafety.stormSurgeDepressed'
                    : 'beachSafety.stormSurgeElevated',
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <StatTile
            label={t('waveHeight')}
            value={formatValue(assessment.waveHeight, 'default', locale)}
            unit={waveHeightUnit}
          />
          <StatTile
            label={t('beachSafety.wavePeriod')}
            value={formatValue(assessment.wavePeriod, 'default', locale)}
            unit={t('beachSafety.secondsAbbr')}
          />
          <StatTile
            label={t('windSpeed')}
            value={formatValue(assessment.windSpeed, 'wind', locale)}
            unit={windSpeedUnit}
          />
          <StatTile label={t('beachSafety.direction')} value={windDirLabel ?? '—'} />
        </dl>
        {seaStateInterpretation && (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            {seaStateInterpretation}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
            {t('beachSafety.waterTemp')}
          </p>
          <WaterTempPanel
            waterTemp={assessment.waterTemp}
            comfortLevel={assessment.comfortLevel}
            locale={locale}
            tempUnit={tempUnit}
            t={t}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
            {t('beachSafety.uvIndex')}
          </p>
          <UVIndexPanel uvIndex={assessment.uvIndex} locale={locale} t={t} />
        </div>
      </Panel>

      {/* 3. Rip current risk panel */}
      <Panel title={t('beachSafety.ripCurrent')}>
        <RipCurrentPanel
          ripCurrentRisk={assessment.ripCurrentRisk}
          ripCurrentProbability={nwpsV15?.ripCurrentProbability ?? null}
          t={t}
          locale={locale}
        />
      </Panel>

      {/* 4. Tide chart — standalone, 72h (shared component, T7.2) */}
      <Panel title={t('beachSafety.tides')}>
        <TideChart
          predictions={tidePredictions}
          waterLevels={waterLevels}
          locale={locale}
          stationTz={stationTz}
          heightUnit={waveHeightUnit}
          ariaLabel={t('beachSafety.tidesAriaLabel', { location: locationName })}
        />
      </Panel>

      {/* 5. NWPS v1.5 coastal flooding risk — show-when-available */}
      {nwpsV15 !== null && (nwpsV15.totalWaterLevel !== null || nwpsV15.waveRunup !== null) && (
        <Panel title={t('beachSafety.coastalRisk')}>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {nwpsV15.totalWaterLevel !== null && (
              <StatTile
                label={t('beachSafety.totalWaterLevel')}
                value={formatValue(nwpsV15.totalWaterLevel, 'default', locale)}
                unit={waveHeightUnit}
              />
            )}
            {nwpsV15.waveRunup !== null && (
              <StatTile
                label={t('beachSafety.waveRunup')}
                value={formatValue(nwpsV15.waveRunup, 'default', locale)}
                unit={waveHeightUnit}
              />
            )}
          </dl>
        </Panel>
      )}

      {/* 6. External links — hidden when empty */}
      {externalLinks.length > 0 && (
        <Panel title={t('beachSafety.localResources')}>
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
        </Panel>
      )}
    </div>
  );
}

export default BeachSafetyTab;
