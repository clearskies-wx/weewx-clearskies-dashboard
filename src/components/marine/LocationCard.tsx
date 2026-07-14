// LocationCard.tsx — Per-location summary card on the Marine Activities
// landing state (DASHBOARD-MANUAL §12). Conditions snapshot only — no
// numeric activity scores on the landing page (those live in the per-
// activity tabs/accordions after a location is selected).
//
// Renders the official Card primitive (footprint="tile") as a direct Grid
// child (T3.4) — the click-to-select control is a real <button> nested
// inside the Card, not the Card element itself, so Card can stay a plain
// <div> wrapper while the interactive surface remains keyboard-reachable
// and announced as actionable per rules/coding.md §5.2.
//
// Linked hover (T3.6): hovering the card highlights the matching numbered
// map pin in LocationMap, and vice versa — `isHovered`/`onHover` thread
// that state up to the parent (MarinePage), which is the single source of
// truth for which location is currently hovered.

import { Waves, Wind, Thermometer, Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import { WeatherIcon } from '../weather-icon';
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
  /** 0-based position in the locations list — rendered as a 1-based badge
   *  matching the corresponding numbered pin on LocationMap (T3.5). */
  index: number;
  /** True when this location's map pin is hovered, or this card itself is
   *  hovered — drives the ring/background highlight (T3.6). */
  isHovered?: boolean;
  /** Notifies the parent when this card is hovered/unhovered so it can
   *  highlight the matching map pin (T3.6). Called with null on leave. */
  onHover?: (locationId: string | null) => void;
}

export function LocationCard({
  location,
  units,
  locale,
  onSelect,
  index,
  isHovered = false,
  onHover,
}: LocationCardProps) {
  const { t } = useTranslation('marine');
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  const conditions = location.currentConditions;
  const airTemp = conditions?.airTemp ?? null;
  const waveHeight = conditions?.waveHeight ?? null;
  const windSpeed = conditions?.windSpeed ?? null;
  const waterTemp = conditions?.waterTemp ?? null;
  const weatherCode = conditions?.weatherCode ?? null;
  // isDay is nullable (unknown-at-provider); default to the day glyph rather
  // than presuming night when the provider hasn't reported it.
  const isNight = conditions?.isDay === false;

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
    <Card
      footprint="tile"
      onMouseEnter={() => onHover?.(location.locationId)}
      onMouseLeave={() => onHover?.(null)}
      className={isHovered ? 'ring-2 ring-primary bg-foreground/5' : undefined}
    >
      <CardContent className="p-0">
        {/* Click-to-select button inside the Card, not the Card itself (DASHBOARD-MANUAL §12) */}
        <button
          type="button"
          onClick={() => onSelect(location.locationId)}
          aria-label={`${location.name} — ${t('map.viewDetails')}`}
          className={[
            'text-left w-full h-full rounded-xl',
            'p-[var(--card-pad)] flex flex-col gap-2',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          ].join(' ')}
        >
          <div className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
              style={{ width: '20px', height: '20px', fontSize: '0.7rem', lineHeight: 1 }}
            >
              {index + 1}
            </span>
            <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground" style={{ fontSize: 'var(--text-card-title)' }}>
              {location.name}
            </h3>
          </div>

          {airTemp !== null && (
            <div className="flex items-center gap-1.5">
              {weatherCode !== null && (
                <WeatherIcon code={weatherCode} isNight={isNight} size={28} />
              )}
              <span
                className="font-semibold text-foreground"
                style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
              >
                {formatValue(airTemp, 'temperature', locale)}{units?.temperature ?? ''}
              </span>
            </div>
          )}

          <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
            <div className="flex flex-col">
              <dt className="flex items-center gap-1">
                <Waves aria-hidden="true" focusable="false" className="size-3" />
                {t('waveHeight')}
              </dt>
              <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                {waveHeight !== null ? `${formatValue(waveHeight, 'default', locale)} ${units?.waveHeight ?? 'ft'}` : '—'}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="flex items-center gap-1">
                <Wind aria-hidden="true" focusable="false" className="size-3" />
                {t('windSpeed')}
              </dt>
              <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                {windSpeed !== null ? `${formatValue(windSpeed, 'wind', locale)} ${units?.windSpeed ?? 'kn'}` : '—'}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="flex items-center gap-1">
                <Thermometer aria-hidden="true" focusable="false" className="size-3" />
                {t('waterTemp')}
              </dt>
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
      </CardContent>
    </Card>
  );
}
