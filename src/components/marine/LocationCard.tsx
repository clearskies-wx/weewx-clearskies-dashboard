// LocationCard.tsx — Per-location summary card on the Marine Activities
// landing state (DASHBOARD-MANUAL §12). Conditions snapshot only — no
// numeric activity scores on the landing page (those live in the per-
// activity tabs/accordions after a location is selected).
//
// The whole card is a single <button> (not a <div onClick>) so it is
// keyboard-reachable and announced as actionable per rules/coding.md §5.2.

import { Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { MarineLocationSummary } from '../../api/types';
import type { UnitsBlock } from '../../api/types';
import { useStation } from '../../hooks/useWeatherData';
import { formatValue } from '../../utils/format';
import { formatTime } from '../../utils/format-date';

interface LocationCardProps {
  location: MarineLocationSummary;
  units?: UnitsBlock;
  locale: string;
  onSelect: (locationId: string) => void;
}

export function LocationCard({ location, units, locale, onSelect }: LocationCardProps) {
  const { t } = useTranslation('marine');
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  const conditions = location.currentConditions;
  const airTemp = conditions?.airTemp ?? null;
  const waveHeight = conditions?.waveHeight ?? null;
  const windSpeed = conditions?.windSpeed ?? null;
  const waterTemp = conditions?.waterTemp ?? null;

  // currentTide is optional on MarineLocationSummary (some locations have no
  // configured tide station) — the next-tide line below simply doesn't
  // render rather than showing a broken "— at —" placeholder.
  const tide = location.currentTide;
  const tideDisplay = tide
    ? t('nowCard.tideAt', {
        type: tide.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow'),
        time: formatTime(new Date(tide.time), locale, stationTz),
      })
    : null;

  const alertCount = location.activeAlerts?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(location.locationId)}
      aria-label={`${location.name} — ${t('map.viewDetails')}`}
      className={[
        'card-glass rounded-xl ring-1 ring-foreground/10 text-left w-full',
        'p-[var(--card-pad)] flex flex-col gap-2',
        'transition-colors hover:ring-primary/40',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-foreground truncate" style={{ fontSize: 'var(--text-card-title)' }}>
          {location.name}
        </h3>
        {airTemp !== null && (
          <span
            className="shrink-0 font-semibold text-foreground"
            style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
          >
            {formatValue(airTemp, 'temperature', locale)}{units?.temperature ?? ''}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
        <div className="flex flex-col">
          <dt>{t('waveHeight')}</dt>
          <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {waveHeight !== null ? `${formatValue(waveHeight, 'default', locale)} ${units?.waveHeight ?? 'ft'}` : '—'}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt>{t('windSpeed')}</dt>
          <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {windSpeed !== null ? `${formatValue(windSpeed, 'wind', locale)} ${units?.windSpeed ?? 'kn'}` : '—'}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt>{t('waterTemp')}</dt>
          <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {waterTemp !== null ? `${formatValue(waterTemp, 'temperature', locale)}${units?.temperature ?? ''}` : '—'}
          </dd>
        </div>
      </dl>

      {tideDisplay && (
        <dl className="flex items-baseline gap-1" style={{ fontSize: 'var(--text-micro)' }}>
          <dt className="text-muted-foreground">{t('nowCard.nextTide')}</dt>
          <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {tideDisplay}
          </dd>
        </dl>
      )}

      {alertCount > 0 && (
        // Same amber "advisory" tier as the earthquake PAGER badge (utils/earthquake.ts
        // alertClasses) — the /marine summary endpoint exposes only a flat alert-id
        // list, not per-alert severity, so a single neutral-warning tier is used here
        // rather than fabricating a red/yellow split without the data to back it.
        // Full severity-aware badges land with the per-location alert detail in T7.2-T7.5.
        <div className="mt-1">
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            style={{ fontSize: 'var(--text-micro)' }}
          >
            <Warning aria-hidden="true" focusable="false" className="size-3" />
            {t('alertCount', { count: alertCount })}
          </span>
        </div>
      )}
    </button>
  );
}
