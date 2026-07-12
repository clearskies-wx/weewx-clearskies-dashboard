// marine-summary-card.tsx — Marine snapshot tile for the Now page.
//
// Shows a compact snapshot of the operator's primary marine location: wave
// height + dominant period, wind speed, water temperature, next tide, an
// active-alert count badge, and (when the location has the corresponding
// activity enabled) a surf-quality star rating and a beach-safety badge.
// Links out to the full Marine Activities page (DASHBOARD-MANUAL.md §12
// "Now page marine summary card").
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
// (DASHBOARD-MANUAL.md §9 "Configured but no data"). surfRating and
// beachSafetyLevel are independently nullable per-location (surf/beach
// safety are opt-in activities) — each renders only when non-null,
// matching the same "configured but no data" reasoning field-by-field.
//
// A11y (WCAG 2.1 AA):
//   - Compass title icon is aria-hidden; the adjacent text carries the
//     accessible name (§5.1: icons never the only signal).
//   - Alert badge pairs a Warning icon + numeric label text — never color
//     alone (§5.1, DESIGN-MANUAL.md "Alert Banner" anti-pattern).
//   - Surf-rating stars: glyphs are aria-hidden; the wrapping element uses
//     role="img" (a plain <span>'s implicit ARIA role is "generic", which
//     does not expose aria-label — role="img" is a naming-container role
//     that does) with a translated "N of 5 stars" label, reusing the
//     `qualitative.stars` key already established by SurfingTab.tsx.
//   - Beach-safety badge pairs a status icon (check/warning/x) + translated
//     safe/caution/dangerous label with the tier color — never color alone,
//     same convention as SafetyIndicator.tsx's full-size equivalent on the
//     Beach Safety detail tab (this is a compact tile-sized variant, not a
//     shared import, since SafetyIndicator is sized for the detail view).
//   - "View Marine" is a real <a> (React Router Link), keyboard-reachable
//     with a visible focus ring (§5.3).
//   - Stat grid is aria-live="polite" so freshness-driven background refetches
//     announce updated values without a page load (§5.4), matching the
//     convention already used by aqi-card / barometer-card / earthquake-card.
//   - All user-visible strings resolve via t() from useTranslation('marine')
//     (rules/coding.md §6.1).

import { CheckCircle, Compass, Warning, XCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { formatValue } from '../utils/format';
import { formatTime } from '../utils/format-date';
import type { MarineLocationSummary, UnitsBlock } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

// ---------------------------------------------------------------------------
// SurfRatingStars — compact tile-sized star rating. Same accessible recipe
// as SurfingTab.tsx's local StarRating (role="img" + translated aria-label,
// glyphs aria-hidden) but reimplemented locally at --text-micro sizing since
// that component isn't exported for cross-tab reuse.
// ---------------------------------------------------------------------------

function SurfRatingStars({ rating, t }: { rating: number; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      role="img"
      aria-label={t('qualitative.stars', { count: rounded })}
      className="inline-flex items-center text-foreground"
      style={{ fontSize: 'var(--text-micro)', letterSpacing: '0.05em' }}
    >
      <span aria-hidden="true">{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// BeachSafetyBadge — compact tile-sized safety badge. Same safe/caution/
// dangerous color+icon tiers as SafetyIndicator.tsx (the full-size Beach
// Safety detail-tab badge) but sized for this tile's --text-micro row,
// matching the alert-count badge already in this card's bottom row.
// ---------------------------------------------------------------------------

const BEACH_SAFETY_BADGE_CONFIG: Record<string, { classes: string; Icon: typeof CheckCircle }> = {
  safe: { classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', Icon: CheckCircle },
  caution: { classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', Icon: Warning },
  dangerous: { classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', Icon: XCircle },
};

function BeachSafetyBadge({ level, t }: { level: string; t: (key: string) => string }) {
  const key = level.toLowerCase();
  const config = key in BEACH_SAFETY_BADGE_CONFIG ? BEACH_SAFETY_BADGE_CONFIG[key] : null;
  // Defensive fallback for an unrecognized value — mirrors marine.tsx's
  // beachSafetyLabel helper and SafetyIndicator.tsx's NEUTRAL tier, since
  // the exact enum isn't locked in the API contract.
  const Icon = config?.Icon ?? Warning;
  const classes = config?.classes ?? 'bg-muted text-foreground';
  const label = config ? t(`beachSafety.${key}`) : level;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${classes}`}
      style={{ fontSize: 'var(--text-micro)' }}
    >
      <Icon aria-hidden="true" focusable="false" className="size-3" />
      {label}
    </span>
  );
}

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
  const surfRating = location.surfRating;
  const beachSafetyLevel = location.beachSafetyLevel;

  const windUnit = units?.windSpeed ?? 'kn';
  const heightUnit = units?.waveHeight ?? 'ft';
  const tempUnit = units?.temperature ?? '';

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
    ? `${formatValue(conditions.waterTemp, 'temperature', locale)}${tempUnit}`
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

        <div className="flex flex-wrap items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {surfRating !== null && <SurfRatingStars rating={surfRating} t={t} />}
            {beachSafetyLevel !== null && <BeachSafetyBadge level={beachSafetyLevel} t={t} />}
            {alertCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                style={{ fontSize: 'var(--text-micro)' }}
              >
                <Warning aria-hidden="true" focusable="false" className="size-3" />
                {t('alertCount', { count: alertCount })}
              </span>
            )}
          </div>
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
