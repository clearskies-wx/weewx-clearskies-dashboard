import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from './components/layout/app-layout';
import { SetupGuard } from './components/SetupGuard';
import { useLocaleSync } from './i18n/use-locale-sync';
import { useBranding } from './lib/branding-provider';
import { PageVisibilityProvider, usePageVisibility, isPageVisible } from './lib/page-visibility';
import { NotFoundPage } from './routes/not-found';

// After a deploy, chunk hashes change. If the browser has a stale index.js
// cached, lazy imports 404. Catch that and reload once to pick up new chunks.
function lazyWithReload(factory: () => Promise<{ default: React.ComponentType }>) {
  return React.lazy(() =>
    factory().catch(() => {
      window.location.reload();
      return new Promise(() => {});
    }),
  );
}

const RadarPage = lazyWithReload(() => import('./routes/radar'));
const NowPage = lazyWithReload(() => import('./routes/now'));
const ForecastPage = lazyWithReload(() => import('./routes/forecast'));
const ChartsPage = lazyWithReload(() => import('./routes/charts'));
const AlmanacPage = lazyWithReload(() => import('./routes/almanac'));
const SeismicPage = lazyWithReload(() => import('./routes/seismic'));
const RecordsPage = lazyWithReload(() => import('./routes/records'));
const ReportsPage = lazyWithReload(() => import('./routes/reports'));
const AboutPage = lazyWithReload(() => import('./routes/about'));
const LegalPage = lazyWithReload(() => import('./routes/legal'));
const CustomPage = lazyWithReload(() => import('./routes/custom-page'));

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

/**
 * VisibilityGuard — renders children when the page is visible; renders
 * NotFoundPage when the page is hidden via /pages.json config.
 * Ensures hidden pages are unreachable even by direct URL entry.
 * "now" is always visible — isPageVisible() enforces this.
 */
function VisibilityGuard({
  pageKey,
  children,
}: {
  pageKey: string;
  children: React.ReactNode;
}) {
  const config = usePageVisibility();
  if (!isPageVisible(pageKey, config)) {
    return <NotFoundPage />;
  }
  return <>{children}</>;
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
      <PageVisibilityProvider>
        <BrowserRouter>
          <Routes>
            {/* /radar — full-viewport expanded radar overlay, outside AppLayout */}
            <Route
              path="radar"
              element={
                <Suspense fallback={<PageLoader title="Radar" />}>
                  <RadarPage />
                </Suspense>
              }
            />
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
                  <VisibilityGuard pageKey="forecast">
                    <Suspense fallback={<PageLoader title={tNav('pages.forecast')} />}>
                      <ForecastPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="charts"
                element={
                  <VisibilityGuard pageKey="charts">
                    <Suspense fallback={<PageLoader title={tNav('pages.charts')} />}>
                      <ChartsPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="almanac"
                element={
                  <VisibilityGuard pageKey="almanac">
                    <Suspense fallback={<PageLoader title={tNav('pages.almanac')} />}>
                      <AlmanacPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="seismic"
                element={
                  <VisibilityGuard pageKey="seismic">
                    <Suspense fallback={<PageLoader title={tNav('pages.seismic')} />}>
                      <SeismicPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="records"
                element={
                  <VisibilityGuard pageKey="records">
                    <Suspense fallback={<PageLoader title={tNav('pages.records')} />}>
                      <RecordsPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="reports"
                element={
                  <VisibilityGuard pageKey="reports">
                    <Suspense fallback={<PageLoader title={tNav('pages.reports')} />}>
                      <ReportsPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="about"
                element={
                  <VisibilityGuard pageKey="about">
                    <Suspense fallback={<PageLoader title={tNav('pages.about')} />}>
                      <AboutPage />
                    </Suspense>
                  </VisibilityGuard>
                }
              />
              <Route
                path="legal"
                element={
                  <VisibilityGuard pageKey="legal">
                    <Suspense fallback={<PageLoader title={tNav('pages.legalPrivacy')} />}>
                      <LegalPage />
                    </Suspense>
                  </VisibilityGuard>
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
                element={<NotFoundPage />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </PageVisibilityProvider>
    </SetupGuard>
  );
}

export default App;
