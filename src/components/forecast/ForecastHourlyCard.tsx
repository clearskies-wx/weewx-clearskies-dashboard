// ForecastHourlyCard.tsx — Full hourly forecast card for the Forecast page (C3 Surface B).
//
// Card footprint: full (4×auto)
// Tabs:
//   "Today"    — next 24 hours of hourly data
//   "Tomorrow" — the following 24 hours (hours 25–48)
//
// HourlyStrip is rendered in scrollable mode (all hours, visible scrollbar).

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from '@phosphor-icons/react';
import { Card, CardHeader, CardContent } from '../ui/card';
import { HourlyStrip } from './HourlyStrip';
import type { ForecastBundle } from '../../api/types';

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
}

type HourTab = 'today' | 'tomorrow';

// ── Component ────────────────────────────────────────────────────────────────

export function ForecastHourlyCard({
  forecast,
  loading,
  error,
  stationTz = 'UTC',
}: ForecastHourlyCardProps) {
  const { t } = useTranslation('forecast');
  const [activeTab, setActiveTab] = useState<HourTab>('today');

  const { todayHours, tomorrowHours } = useMemo(() => {
    const all = forecast?.hourly ?? [];
    return {
      todayHours: all.slice(0, 24),
      tomorrowHours: all.slice(24, 48),
    };
  }, [forecast]);

  const handleTabKey = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight') {
      setActiveTab('tomorrow');
      (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus();
    } else if (e.key === 'ArrowLeft') {
      setActiveTab('today');
      (e.currentTarget.previousElementSibling as HTMLButtonElement | null)?.focus();
    }
  }, []);

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
    fontSize: '0.72rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '999px',
    padding: '0.18rem 0.65rem',
    cursor: 'pointer',
    lineHeight: 1.5,
    background: isActive ? 'var(--primary)' : 'rgba(0,0,0,0.07)',
    color: isActive ? 'var(--primary-foreground, #fff)' : 'var(--muted-foreground)',
  });

  return (
    <Card footprint="full" aria-busy={loading}>
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
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: 'var(--text-card-title, 0.82rem)',
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            <Clock
              aria-hidden="true"
              focusable={false}
              size={16}
              style={{ opacity: 0.75, flexShrink: 0 }}
            />
            {t('hourlyForecast')}
          </span>

          <div
            role="tablist"
            aria-label={t('ariaTabList')}
            style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginLeft: 'auto' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'today'}
              aria-controls="fc-hourly-panel-today"
              id="fc-hourly-tab-today"
              tabIndex={activeTab === 'today' ? 0 : -1}
              onClick={() => setActiveTab('today')}
              onKeyDown={handleTabKey}
              style={tabStyle(activeTab === 'today')}
            >
              {t('tabToday')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tomorrow'}
              aria-controls="fc-hourly-panel-tomorrow"
              id="fc-hourly-tab-tomorrow"
              tabIndex={activeTab === 'tomorrow' ? 0 : -1}
              onClick={() => setActiveTab('tomorrow')}
              onKeyDown={handleTabKey}
              style={tabStyle(activeTab === 'tomorrow')}
            >
              {t('tabTomorrow')}
            </button>
          </div>
        </div>
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
                <HourlyStrip hours={todayHours} stationTz={stationTz} />
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
                <HourlyStrip hours={tomorrowHours} stationTz={stationTz} />
              ) : (
                <p style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-body, 0.9rem)' }}>
                  {t('noHourlyData')}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ForecastHourlyCard;
