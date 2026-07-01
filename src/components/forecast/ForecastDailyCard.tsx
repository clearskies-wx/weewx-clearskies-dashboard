// ForecastDailyCard.tsx — 7-day forecast card for the Forecast page (C3 Surface C).
//
// Card footprint: full (4×auto)
// Renders DailyColumns with expandable=true (accent bars + detail expansion panel).
// No tabs.

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent, CardTitle } from '../ui/card';
import { DailyColumns } from './DailyColumns';
import { ForecastAttribution } from './ForecastAttribution';
import type { ForecastBundle, UnitsBlock } from '../../api/types';

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height: '10rem' }}
      aria-hidden="true"
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ForecastDailyCardProps {
  forecast: ForecastBundle | null;
  loading: boolean;
  error: Error | null;
  stationTz?: string;
  units?: UnitsBlock;
  /** Station-local date (YYYY-MM-DD) from stationClock.date (ADR-075). */
  stationDate?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ForecastDailyCard({
  forecast,
  loading,
  error,
  stationTz = 'UTC',
  units,
  stationDate,
}: ForecastDailyCardProps) {
  const { t } = useTranslation('forecast');

  const days = forecast?.daily?.slice(0, 7) ?? [];

  return (
    <Card footprint="full" aria-busy={loading} style={{ paddingBottom: 0 }}>
      <CardHeader>
        <CardTitle as="h2">{t('sevenDayForecast')}</CardTitle>
      </CardHeader>

      <CardContent style={{ paddingBottom: 'var(--card-pad)' }}>
        {loading ? (
          <>
            <span className="sr-only" role="status">Loading 7-day forecast…</span>
            <Skeleton />
          </>
        ) : error ? (
          <p role="alert" style={{ color: 'var(--destructive)', fontSize: 'var(--text-body, 0.9rem)' }}>
            Unable to load 7-day forecast.
          </p>
        ) : days.length > 0 ? (
          <DailyColumns
            days={days}
            expandable
            stationTz={stationTz}
            units={units}
            stationDate={stationDate}
          />
        ) : (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
            {t('noDailyData')}
          </p>
        )}
      </CardContent>
      <ForecastAttribution source={forecast?.source} />
    </Card>
  );
}

export default ForecastDailyCard;
