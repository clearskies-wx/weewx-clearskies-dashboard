import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from './components/layout/app-layout';
import { SetupGuard } from './components/SetupGuard';
import { useLocaleSync } from './i18n/use-locale-sync';
import { useBranding } from './lib/branding-provider';

const NowPage = React.lazy(() => import('./routes/now'));
const ForecastPage = React.lazy(() => import('./routes/forecast'));
const ChartsPage = React.lazy(() => import('./routes/charts'));
const AlmanacPage = React.lazy(() => import('./routes/almanac'));
const EarthquakesPage = React.lazy(() => import('./routes/earthquakes'));
const RecordsPage = React.lazy(() => import('./routes/records'));
const ReportsPage = React.lazy(() => import('./routes/reports'));
const AboutPage = React.lazy(() => import('./routes/about'));
const LegalPage = React.lazy(() => import('./routes/legal'));
const CustomPage = React.lazy(() => import('./routes/custom-page'));
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
  const branding = useBranding();

  // Inject operator-supplied custom.css when the branding API provides a URL.
  // The <link> element is appended to <head> and cleaned up when the URL changes
  // or the component unmounts. A stable element id prevents duplicate injections
  // on StrictMode double-invoke. customCssUrl from DEFAULT_BRANDING is undefined,
  // so this effect is a no-op in mock mode and before the API responds.
  useEffect(() => {
    if (!branding.customCssUrl) return;
    const id = 'custom-css';
    // Avoid inserting a duplicate if already present (React StrictMode double-invoke).
    const existing = document.getElementById(id);
    if (existing) {
      (existing as HTMLLinkElement).href = branding.customCssUrl;
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = branding.customCssUrl;
    link.id = id;
    document.head.appendChild(link);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [branding.customCssUrl]);

  return (
    <SetupGuard>
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
            path=":slug"
            element={
              <Suspense fallback={<PageLoader title={tCommon('customPageLoading')} />}>
                <CustomPage />
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
    </SetupGuard>
  );
}

export default App;
