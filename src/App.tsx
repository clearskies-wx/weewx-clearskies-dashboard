import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from './components/layout/app-layout';
import { useLocaleSync } from './i18n/use-locale-sync';

const NowPage = React.lazy(() => import('./routes/now'));
const ForecastPage = React.lazy(() => import('./routes/forecast'));
const ChartsPage = React.lazy(() => import('./routes/charts'));
const AlmanacPage = React.lazy(() => import('./routes/almanac'));
const EarthquakesPage = React.lazy(() => import('./routes/earthquakes'));
const RecordsPage = React.lazy(() => import('./routes/records'));
const ReportsPage = React.lazy(() => import('./routes/reports'));
const AboutPage = React.lazy(() => import('./routes/about'));
const LegalPage = React.lazy(() => import('./routes/legal'));
const NotFoundPage = React.lazy(() => import('./routes/not-found'));

// PageLoader — Suspense fallback used for every lazy route.
// Includes a visually-hidden <h1> so axe-core's page-has-heading-one rule
// is satisfied even while the lazy chunk is still loading (WCAG 2.4.6 /
// axe best-practice). The `title` prop must match the page's own <h1>.
function PageLoader({ title }: { title: string }) {
  const { t } = useTranslation('common');
  return (
    <div
      className="flex items-center justify-center h-full"
      role="status"
      aria-label={t('loadingPage', { title })}
    >
      <h1 className="sr-only">{title}</h1>
      <span className="sr-only">{t('loading')}</span>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function App() {
  // Keeps <html lang="…"> in sync with the active i18next locale (ADR-021 / WCAG 2.4.2).
  useLocaleSync();
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.now')} />}>
                <NowPage />
              </Suspense>
            }
          />
          <Route
            path="forecast"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.forecast')} />}>
                <ForecastPage />
              </Suspense>
            }
          />
          <Route
            path="charts"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.charts')} />}>
                <ChartsPage />
              </Suspense>
            }
          />
          <Route
            path="almanac"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.almanac')} />}>
                <AlmanacPage />
              </Suspense>
            }
          />
          <Route
            path="earthquakes"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.earthquakes')} />}>
                <EarthquakesPage />
              </Suspense>
            }
          />
          <Route
            path="records"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.records')} />}>
                <RecordsPage />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.reports')} />}>
                <ReportsPage />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.about')} />}>
                <AboutPage />
              </Suspense>
            }
          />
          <Route
            path="legal"
            element={
              <Suspense fallback={<PageLoader title={tNav('pages.legalPrivacy')} />}>
                <LegalPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader title={tCommon('pageNotFound')} />}>
                <NotFoundPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
