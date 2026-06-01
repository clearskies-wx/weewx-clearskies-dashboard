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
import { AlertBanner } from '../components/shared/alert-banner';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';
import { ForecastHourlyCard } from '../components/forecast/ForecastHourlyCard';
import { ForecastDailyCard } from '../components/forecast/ForecastDailyCard';
import { ForecastDiscussionCard } from '../components/forecast/ForecastDiscussionCard';
import { useForecast, useAlerts, useStation } from '../hooks/useWeatherData';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return '—';
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  return rtf.format(diffDay, 'day');
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ForecastPage() {
  const { t, i18n } = useTranslation('forecast');
  const locale = i18n.language;

  // Request 48h of hourly data so the Tomorrow tab is populated.
  const { data: forecast, loading: fcLoading, error: fcError } = useForecast({ hours: 48 });
  const { data: station } = useStation();
  const { data: alerts, loading: alertLoading } = useAlerts();

  const tz = station?.timezone ?? 'UTC';

  // Freshness text: "Updated N minutes ago · Source"
  const freshnessText = forecast?.generatedAt
    ? `${t('updated', { time: formatRelativeTime(forecast.generatedAt, locale) })}${forecast.source ? ` · ${forecast.source}` : ''}`
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('title')}</h1>

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      <Grid>
        {/* ── Page header ──────────────────────────────────────────────── */}
        <PageHeaderCard title={t('title')} info={freshnessText} />

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
