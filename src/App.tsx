import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/app-layout';

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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <NowPage />
              </Suspense>
            }
          />
          <Route
            path="forecast"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <ForecastPage />
              </Suspense>
            }
          />
          <Route
            path="charts"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <ChartsPage />
              </Suspense>
            }
          />
          <Route
            path="almanac"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <AlmanacPage />
              </Suspense>
            }
          />
          <Route
            path="earthquakes"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <EarthquakesPage />
              </Suspense>
            }
          />
          <Route
            path="records"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <RecordsPage />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <ReportsPage />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <AboutPage />
              </Suspense>
            }
          />
          <Route
            path="legal"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
                <LegalPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-label="Loading page"
                  >
                    <span className="sr-only">Loading…</span>
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                }
              >
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
