// NowForecastCard.tsx — Tabbed forecast card for the Now page (C3 Surface A).
//
// Card footprint: wide (2×1)
// Tabs:
//   "Today" (default) — HourlyStrip with threeHourWindows=true
//   "7-Day"           — DailyColumns with expandable=false
//
// WAI-ARIA tabs pattern: role="tablist"/"tab"/"tabpanel", Arrow keys.
// Card header: calendar icon + "Today's Forecast" + tab pills right-justified.
//
// DataBag pattern (T0B.2): card self-extracts from dataBag["/api/v1/forecast"].
// Uses props.stationTz from CardComponentProps directly.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent, CardTitle } from '../ui/card';
import { HeaderTabs } from '../ui/header-controls';
import { HourlyStrip } from './HourlyStrip';
import { DailyColumns } from './DailyColumns';
import type { ForecastBundle, StationClock } from '../../api/types';
import type { CardComponentProps } from '../../lib/card-registry';

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
  /** Station-local date (YYYY-MM-DD) from stationClock.date (ADR-075). */
  stationDate?: string;
}

type Tab = 'today' | '7day';

// ── Core render logic (shared by both prop shapes) ───────────────────────────

function NowForecastCardContent({
  forecast,
  loading,
  error,
  stationTz = 'UTC',
  stationDate,
  footer,
}: NowForecastCardProps & { footer?: React.ReactNode }) {
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
            className="text-muted-foreground"
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-body, 0.9rem)',
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
                  dailyForecasts={dailyDays}
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
                  stationDate={stationDate}
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
      {footer}
    </Card>
  );
}

// ── DataBag-aware component (CardComponentProps — T0B.2 contract) ─────────────

export function NowForecastCard(props: CardComponentProps): React.ReactElement;
export function NowForecastCard(props: NowForecastCardProps): React.ReactElement;
export function NowForecastCard(props: CardComponentProps | NowForecastCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/forecast; use stationTz from CardComponentProps
    const forecastData = props.dataBag['/api/v1/forecast'] as {
      data?: ForecastBundle | null;
      loading?: boolean;
      error?: unknown;
      stationClock?: StationClock;
    } | undefined;

    return (
      <NowForecastCardContent
        forecast={forecastData?.data ?? null}
        loading={forecastData?.loading ?? true}
        error={forecastData?.error ? new Error('error') : null}
        stationTz={props.stationTz}
        stationDate={forecastData?.stationClock?.date}
        footer={props.footer}
      />
    );
  }
  // Legacy path — explicit props
  return (
    <NowForecastCardContent
      forecast={props.forecast}
      loading={props.loading}
      error={props.error}
      stationTz={props.stationTz}
      stationDate={props.stationDate}
    />
  );
}

export default NowForecastCard;
