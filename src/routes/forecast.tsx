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
import { ProviderAttribution } from '../components/shared/ProviderAttribution';
import { useForecast, useStation, useCapabilities } from '../hooks/useWeatherData';

// ── Page ─────────────────────────────────────────────────────────────────────

export function ForecastPage() {
  const { t } = useTranslation('forecast');

  // Request 48h of hourly data so the Tomorrow tab is populated.
  const { data: forecast, units: fcUnits, loading: fcLoading, error: fcError, stationClock } = useForecast({ hours: 48 });
  const { data: station } = useStation();
  const { data: capabilities } = useCapabilities();

  const tz = station?.timezone ?? 'UTC';

  // Host-rendered provider attribution (ADR-080, DASHBOARD-MANUAL §8).
  // ForecastHourlyCard and ForecastDailyCard share one data source
  // (forecast?.source) — a single lookup covers both. ForecastDiscussionCard
  // does not get its own attribution line: same provider, and it self-hides
  // when empty, so one attribution per page data source is sufficient.
  const forecastAttribution = capabilities?.providers.find(
    (p) => p.providerId === forecast?.source,
  )?.attribution;
  const showForecastAttribution = forecastAttribution?.attributionRequired ?? false;

  return (
    <PageLayout title={t('title')} icon={<CloudSun weight="duotone" />}>
      {/* ── Surface B: Hourly ─────────────────────────────────────────── */}
      <ForecastHourlyCard
        forecast={forecast}
        loading={fcLoading}
        error={fcError}
        stationTz={tz}
        units={fcUnits}
        footer={showForecastAttribution && forecast?.source && forecastAttribution ? (
          <ProviderAttribution
            attributionText={forecastAttribution.attributionText}
            displayName={forecastAttribution.displayName}
            logoRequired={forecastAttribution.logoRequired}
            doNotUseLogo={forecastAttribution.doNotUseLogo}
            textTranslatable={forecastAttribution.textTranslatable}
            providerId={forecast.source}
          />
        ) : undefined}
      />

      {/* ── Surface C: 7-Day ──────────────────────────────────────────── */}
      <ForecastDailyCard
        forecast={forecast}
        loading={fcLoading}
        error={fcError}
        stationTz={tz}
        units={fcUnits}
        stationDate={stationClock?.date}
        footer={showForecastAttribution && forecast?.source && forecastAttribution ? (
          <ProviderAttribution
            attributionText={forecastAttribution.attributionText}
            displayName={forecastAttribution.displayName}
            logoRequired={forecastAttribution.logoRequired}
            doNotUseLogo={forecastAttribution.doNotUseLogo}
            textTranslatable={forecastAttribution.textTranslatable}
            providerId={forecast.source}
          />
        ) : undefined}
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
