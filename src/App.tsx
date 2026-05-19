// App.tsx — React Router setup per ADR-024 page taxonomy.
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/app-layout';
import { NowPage } from './routes/now';
import { ForecastPage } from './routes/forecast';
import { ChartsPage } from './routes/charts';
import { AlmanacPage } from './routes/almanac';
import { EarthquakesPage } from './routes/earthquakes';
import { RecordsPage } from './routes/records';
import { ReportsPage } from './routes/reports';
import { AboutPage } from './routes/about';
import { LegalPage } from './routes/legal';
import { NotFoundPage } from './routes/not-found';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<NowPage />} />
          <Route path="forecast" element={<ForecastPage />} />
          <Route path="charts" element={<ChartsPage />} />
          <Route path="almanac" element={<AlmanacPage />} />
          <Route path="earthquakes" element={<EarthquakesPage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="legal" element={<LegalPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
