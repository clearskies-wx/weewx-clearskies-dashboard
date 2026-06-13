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
import { PageLayout } from '../components/layout/page-layout';
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
    <PageLayout title={t('title')} icon={<CloudSun weight="duotone" />}>
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
    </PageLayout>
  );
}

export default ForecastPage;
