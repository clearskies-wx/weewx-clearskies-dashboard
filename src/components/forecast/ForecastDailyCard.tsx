// ForecastDailyCard.tsx — 7-day forecast card for the Forecast page (C3 Surface C).
//
// Card footprint: full (4×auto)
// Renders DailyColumns with expandable=true (accent bars + detail expansion panel).
// No tabs.

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '../ui/card';
import { DailyColumns } from './DailyColumns';
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
}

// ── Component ────────────────────────────────────────────────────────────────

export function ForecastDailyCard({
  forecast,
  loading,
  error,
  stationTz = 'UTC',
  units,
}: ForecastDailyCardProps) {
  const { t } = useTranslation('forecast');

  const days = forecast?.daily?.slice(0, 7) ?? [];

  return (
    <Card footprint="full" aria-busy={loading} style={{ paddingBottom: 0 }}>
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            borderBottom: '1px solid var(--border, rgba(0,0,0,0.12))',
            paddingBottom: '0.4rem',
          }}
        >
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: 'var(--text-card-title, 0.82rem)',
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            {t('sevenDayForecast')}
          </span>
        </div>
      </CardHeader>

      <CardContent>
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
          />
        ) : (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
            {t('noDailyData')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ForecastDailyCard;
