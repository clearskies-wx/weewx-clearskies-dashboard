// NowForecastCard.tsx — Tabbed forecast card for the Now page (C3 Surface A).
//
// Card footprint: wide (2×1)
// Tabs:
//   "Today" (default) — HourlyStrip with threeHourWindows=true
//   "7-Day"           — DailyColumns with expandable=false
//
// WAI-ARIA tabs pattern: role="tablist"/"tab"/"tabpanel", Arrow keys.
// Card header: calendar icon + "Today's Forecast" + tab pills right-justified.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent, CardTitle } from '../ui/card';
import { HeaderTabs } from '../ui/header-controls';
import { HourlyStrip } from './HourlyStrip';
import { DailyColumns } from './DailyColumns';
import type { ForecastBundle } from '../../api/types';

// ── Loading / Error skeletons ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height: '6rem' }}
      aria-hidden="true"
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface NowForecastCardProps {
  forecast: ForecastBundle | null;
  loading: boolean;
  error: Error | null;
  stationTz?: string;
}

type Tab = 'today' | '7day';

// ── Component ────────────────────────────────────────────────────────────────

export function NowForecastCard({
  forecast,
  loading,
  error,
  stationTz = 'UTC',
}: NowForecastCardProps) {
  const { t } = useTranslation('forecast');
  const [activeTab, setActiveTab] = useState<Tab>('today');

  // Take only the first 24 hours for the Today tab (3-hour windows = 8 data points)
  const next24hours = forecast?.hourly?.slice(0, 24) ?? [];
  const dailyDays = forecast?.daily?.slice(0, 7) ?? [];

  return (
    <Card footprint="wide" rowSpan={2} aria-busy={loading}>
      {/* Card header: title + tab pills on the same line */}
      <CardHeader>
        <CardTitle as="h2">{t('todaysForecast')}</CardTitle>
        <HeaderTabs
          tabs={[
            { id: 'today', label: t('tabToday') },
            { id: '7day', label: t('tab7Day') },
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as Tab)}
          ariaLabel={t('ariaTabList')}
          idPrefix="now-fc-tab"
          panelIdPrefix="now-fc-panel"
        />
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">Loading forecast…</span>
            <Skeleton />
          </>
        ) : error ? (
          <p
            role="alert"
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-body, 0.9rem)',
              color: 'var(--destructive)',
            }}
          >
            Unable to load forecast.
          </p>
        ) : (
          <>
            {/* Today tab panel */}
            <div
              id="now-fc-panel-today"
              role="tabpanel"
              aria-labelledby="now-fc-tab-today"
              style={{
                display: activeTab === 'today' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {next24hours.length > 0 ? (
                <HourlyStrip
                  hours={next24hours}
                  threeHourWindows
                  stationTz={stationTz}
                />
              ) : (
                <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
                  No hourly forecast available.
                </p>
              )}
            </div>

            {/* 7-Day tab panel */}
            <div
              id="now-fc-panel-7day"
              role="tabpanel"
              aria-labelledby="now-fc-tab-7day"
              style={{
                display: activeTab === '7day' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'visible',
              }}
            >
              {dailyDays.length > 0 ? (
                <DailyColumns
                  days={dailyDays}
                  expandable={false}
                  stationTz={stationTz}
                />
              ) : (
                <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
                  No daily forecast available.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default NowForecastCard;
