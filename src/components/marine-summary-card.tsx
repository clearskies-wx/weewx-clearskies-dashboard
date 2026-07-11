// marine-summary-card.tsx — Marine snapshot tile for the Now page.
//
// Shows a compact snapshot of the operator's primary marine location: wave
// height + dominant period, wind speed, water temperature, next tide, and
// an active-alert count badge. Links out to the full Marine Activities page
// (DASHBOARD-MANUAL.md §12 "Now page marine summary card").
//
// DataBag pattern (T0B.2 card plugin contract): card self-extracts from
// dataBag["/api/v1/marine"]. This is a brand-new card with no legacy
// standalone caller, so it accepts CardComponentProps directly — no
// overloaded legacy-props signature is needed (unlike earthquake-card /
// barometer-card, which predate the registry and kept a back-compat path).
//
// Self-hide behavior (DESIGN-MANUAL.md §10 "Data-driven hide"): this card
// hides itself (returns null) when the marine feature isn't configured
// (no dataBag entry) or no marine locations exist — mirroring the Marine
// page's own self-hide rule (DASHBOARD-MANUAL.md §12 "Page visibility").
// When a location IS configured but its live snapshot is transiently
// absent, the card stays visible with "—" placeholders rather than hiding
// (DASHBOARD-MANUAL.md §9 "Configured but no data").
//
// A11y (WCAG 2.1 AA):
//   - Compass title icon is aria-hidden; the adjacent text carries the
//     accessible name (§5.1: icons never the only signal).
//   - Alert badge pairs a Warning icon + numeric label text — never color
//     alone (§5.1, DESIGN-MANUAL.md "Alert Banner" anti-pattern).
//   - "View Marine" is a real <a> (React Router Link), keyboard-reachable
//     with a visible focus ring (§5.3).
//   - Stat grid is aria-live="polite" so freshness-driven background refetches
//     announce updated values without a page load (§5.4), matching the
//     convention already used by aqi-card / barometer-card / earthquake-card.
//   - All user-visible strings resolve via t() from useTranslation('marine')
//     (rules/coding.md §6.1).

import { Compass, Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { formatValue } from '../utils/format';
import { formatTime } from '../utils/format-date';
import type { MarineLocationSummary, UnitsBlock } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

export default function MarineSummaryCard({ dataBag, stationTz }: CardComponentProps) {
  const { t, i18n } = useTranslation('marine');
  const locale = i18n.language;

  const marineEntry = dataBag['/api/v1/marine'] as
    | { data?: MarineLocationSummary[] | null; units?: UnitsBlock }
    | undefined;

  const locations = marineEntry?.data;

  // No marine feature configured, or configured with zero locations — hide.
  if (!locations || locations.length === 0) return null;

  const location = locations[0];
  const units = marineEntry?.units;
  const conditions = location.currentConditions;
  const tide = location.currentTide;
  const alertCount = location.activeAlerts?.length ?? 0;

  const windUnit = units?.windSpeed ?? 'kn';
  const heightUnit = units?.waveHeight ?? 'ft';

  const waveHeightDisplay = conditions?.waveHeight != null
    ? `${formatValue(conditions.waveHeight, 'default', locale)} ${heightUnit}`
    : '—';
  const periodDisplay = conditions?.dominantPeriod != null
    ? `${formatValue(conditions.dominantPeriod, 'default', locale)}${t('boating.secondsAbbr')}`
    : null;

  const windDisplay = conditions?.windSpeed != null
    ? `${formatValue(conditions.windSpeed, 'wind', locale)} ${windUnit}`
    : '—';

  const waterTempDisplay = conditions?.waterTemp != null
    ? `${formatValue(conditions.waterTemp, 'temperature', locale)}°`
    : '—';

  const tideDisplay = tide
    ? t('nowCard.tideAt', {
        type: tide.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow'),
        time: formatTime(new Date(tide.time), locale, stationTz),
      })
    : '—';

  return (
    <Card footprint="tile" rowSpan={1}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-1.5">
          <Compass aria-hidden="true" focusable="false" className="shrink-0" size={18} />
          {t('nowCard.title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {!conditions ? (
          <p
            className="text-muted-foreground"
            style={{ fontSize: 'var(--text-body)' }}
          >
            {t('nowCard.noData')}
          </p>
        ) : (
          <dl
            aria-live="polite"
            className="grid grid-cols-2 gap-x-2 gap-y-1"
            style={{ fontSize: 'var(--text-label)' }}
          >
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t('waveHeight')}</dt>
              <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                {waveHeightDisplay}
                {periodDisplay && (
                  <span
                    className="text-muted-foreground font-normal"
                    style={{ fontSize: 'var(--text-micro)' }}
                  >
                    {' @ '}{periodDisplay}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t('windSpeed')}</dt>
              <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                {windDisplay}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t('waterTemp')}</dt>
              <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                {waterTempDisplay}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t('nowCard.nextTide')}</dt>
              <dd className="text-foreground font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
                {tideDisplay}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          {alertCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
              style={{ fontSize: 'var(--text-micro)' }}
            >
              <Warning aria-hidden="true" focusable="false" className="size-3" />
              {t('alertCount', { count: alertCount })}
            </span>
          ) : (
            <span />
          )}
          <Link
            to="/marine"
            className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            style={{ fontSize: 'var(--text-micro)' }}
          >
            {t('nowCard.viewMarine')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
