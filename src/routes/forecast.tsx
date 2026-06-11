// forecast.tsx — Forecast page (C3 redesign).
//
// Replaces the previous section-based layout with four glass cards in the
// shared Grid primitive, matching C3-forecast-page.html exactly:
//
//   PageHeaderCard   — full width, page title + freshness info
//   ForecastHourlyCard  — Surface B: tabbed hourly (Today / Tomorrow), scrollable
//   ForecastDailyCard   — Surface C: 7-day columns with expandable detail
//   ForecastDiscussionCard — Surface D: AFD text (self-hides when empty)
//
// useForecast({ hours: 48 }) requests 48h of hourly data for Tomorrow tab.

import { useTranslation } from 'react-i18next';
import { CloudSun } from '@phosphor-icons/react';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';
import { ForecastHourlyCard } from '../components/forecast/ForecastHourlyCard';
import { ForecastDailyCard } from '../components/forecast/ForecastDailyCard';
import { ForecastDiscussionCard } from '../components/forecast/ForecastDiscussionCard';
import { useForecast, useStation } from '../hooks/useWeatherData';

// ── Page ─────────────────────────────────────────────────────────────────────

export function ForecastPage() {
  const { t } = useTranslation('forecast');

  // Request 48h of hourly data so the Tomorrow tab is populated.
  const { data: forecast, units: fcUnits, loading: fcLoading, error: fcError } = useForecast({ hours: 48 });
  const { data: station } = useStation();

  const tz = station?.timezone ?? 'UTC';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('title')}</h1>

      <Grid className="md:auto-rows-[auto]">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <PageHeaderCard title={t('title')} icon={<CloudSun weight="duotone" />} />

        {/* ── Surface B: Hourly ─────────────────────────────────────────── */}
        <ForecastHourlyCard
          forecast={forecast}
          loading={fcLoading}
          error={fcError}
          stationTz={tz}
        />

        {/* ── Surface C: 7-Day ──────────────────────────────────────────── */}
        <ForecastDailyCard
          forecast={forecast}
          loading={fcLoading}
          error={fcError}
          stationTz={tz}
          units={fcUnits}
        />

        {/* ── Surface D: Discussion (self-hides when empty) ─────────────── */}
        <ForecastDiscussionCard
          discussion={forecast?.discussion ?? null}
          stationTz={tz}
        />
      </Grid>
    </div>
  );
}

export default ForecastPage;
