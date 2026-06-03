// NowForecastCard.tsx — Tabbed forecast card for the Now page (C3 Surface A).
//
// Card footprint: wide (2×1)
// Tabs:
//   "Today" (default) — HourlyStrip with threeHourWindows=true
//   "7-Day"           — DailyColumns with expandable=false
//
// WAI-ARIA tabs pattern: role="tablist"/"tab"/"tabpanel", Arrow keys.
// Card header: calendar icon + "Today's Forecast" + tab pills right-justified.

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '../ui/card';
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

  const handleTabKey = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight') {
      setActiveTab('7day');
      (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus();
    } else if (e.key === 'ArrowLeft') {
      setActiveTab('today');
      (e.currentTarget.previousElementSibling as HTMLButtonElement | null)?.focus();
    }
  }, []);

  // Take only the first 24 hours for the Today tab (3-hour windows = 8 data points)
  const next24hours = forecast?.hourly?.slice(0, 24) ?? [];
  const dailyDays = forecast?.daily?.slice(0, 7) ?? [];

  return (
    <Card footprint="wide" size="sm" aria-busy={loading}>
      {/* Card header: title + tab pills on the same line */}
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border, rgba(0,0,0,0.12))',
            paddingBottom: '0.35rem',
          }}
        >
          {/* Title group (fills remaining space) */}
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: 'var(--text-card-title, 0.82rem)',
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            {t('todaysForecast')}
          </span>

          {/* Tab pills — right-justified */}
          <div
            role="tablist"
            aria-label={t('ariaTabList')}
            style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginLeft: 'auto' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'today'}
              aria-controls="now-fc-panel-today"
              id="now-fc-tab-today"
              tabIndex={activeTab === 'today' ? 0 : -1}
              onClick={() => setActiveTab('today')}
              onKeyDown={handleTabKey}
              style={{
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: 'none',
                borderRadius: '999px',
                padding: '0.16rem 0.55rem',
                cursor: 'pointer',
                lineHeight: 1.4,
                background: activeTab === 'today' ? 'var(--primary)' : 'rgba(0,0,0,0.07)',
                color: activeTab === 'today' ? 'var(--primary-foreground, #fff)' : 'var(--muted-foreground)',
              }}
            >
              {t('tabToday')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === '7day'}
              aria-controls="now-fc-panel-7day"
              id="now-fc-tab-7day"
              tabIndex={activeTab === '7day' ? 0 : -1}
              onClick={() => setActiveTab('7day')}
              onKeyDown={handleTabKey}
              style={{
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: 'none',
                borderRadius: '999px',
                padding: '0.16rem 0.55rem',
                cursor: 'pointer',
                lineHeight: 1.4,
                background: activeTab === '7day' ? 'var(--primary)' : 'rgba(0,0,0,0.07)',
                color: activeTab === '7day' ? 'var(--primary-foreground, #fff)' : 'var(--muted-foreground)',
              }}
            >
              {t('tab7Day')}
            </button>
          </div>
        </div>
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
                  hideTrend
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
