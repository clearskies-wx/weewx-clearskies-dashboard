// ForecastHourlyCard.tsx — Full hourly forecast card for the Forecast page (C3 Surface B).
//
// Card footprint: full (4×auto)
// Tabs:
//   "Today"    — next 24 hours of hourly data
//   "Tomorrow" — the following 24 hours (hours 25–48)
//
// HourlyStrip is rendered in scrollable mode (all hours, visible scrollbar).

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent, CardTitle } from '../ui/card';
import { HeaderTabs } from '../ui/header-controls';
import { HourlyStrip } from './HourlyStrip';
import { ForecastAttribution } from './ForecastAttribution';
import type { ForecastBundle, UnitsBlock } from '../../api/types';

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height: '8rem' }}
      aria-hidden="true"
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ForecastHourlyCardProps {
  forecast: ForecastBundle | null;
  loading: boolean;
  error: Error | null;
  stationTz?: string;
  units?: UnitsBlock | null;
}

type HourTab = 'today' | 'tomorrow';

// ── Component ────────────────────────────────────────────────────────────────

export function ForecastHourlyCard({
  forecast,
  loading,
  error,
  stationTz = 'UTC',
  units,
}: ForecastHourlyCardProps) {
  const { t } = useTranslation('forecast');
  const [activeTab, setActiveTab] = useState<HourTab>('today');

  const { todayHours, tomorrowHours, daily } = useMemo(() => {
    const all = forecast?.hourly ?? [];
    return {
      todayHours: all.slice(0, 24),
      tomorrowHours: all.slice(24, 48),
      daily: forecast?.daily ?? [],
    };
  }, [forecast]);

  return (
    <Card footprint="full" aria-busy={loading}>
      <CardHeader>
        <CardTitle as="h2">{t('hourlyForecast')}</CardTitle>
        <HeaderTabs
          tabs={[
            { id: 'today', label: t('tabToday') },
            { id: 'tomorrow', label: t('tabTomorrow') },
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as HourTab)}
          ariaLabel={t('ariaTabList')}
          idPrefix="fc-hourly-tab"
          panelIdPrefix="fc-hourly-panel"
        />
      </CardHeader>

      <CardContent className="overflow-visible">
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loadingHourly')}</span>
            <Skeleton />
          </>
        ) : error ? (
          <p role="alert" style={{ color: 'var(--destructive)', fontSize: 'var(--text-body, 0.9rem)' }}>
            {t('unableToLoad')}
          </p>
        ) : (
          <>
            <div
              id="fc-hourly-panel-today"
              role="tabpanel"
              aria-labelledby="fc-hourly-tab-today"
              style={{ display: activeTab === 'today' ? 'block' : 'none' }}
            >
              {todayHours.length > 0 ? (
                <HourlyStrip hours={todayHours} stationTz={stationTz} units={units} dailyForecasts={daily} />
              ) : (
                <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
                  {t('noHourlyData')}
                </p>
              )}
            </div>

            <div
              id="fc-hourly-panel-tomorrow"
              role="tabpanel"
              aria-labelledby="fc-hourly-tab-tomorrow"
              style={{ display: activeTab === 'tomorrow' ? 'block' : 'none' }}
            >
              {tomorrowHours.length > 0 ? (
                <HourlyStrip hours={tomorrowHours} stationTz={stationTz} units={units} dailyForecasts={daily} />
              ) : (
                <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
                  {t('noHourlyData')}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
      <ForecastAttribution source={forecast?.source} />
    </Card>
  );
}

export default ForecastHourlyCard;
