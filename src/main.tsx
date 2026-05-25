import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/leaflet-setup'
// Initialize i18next before React renders so the first render already has
// translations available (or gracefully defers to the Suspense boundary below).
import './i18n'
import App from './App.tsx'
import { BrandingProvider } from './lib/branding-provider'
import { ThemeProvider } from './lib/theme-provider'
import { ErrorBoundary } from './components/error-boundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ErrorBoundary is outermost — catches any render error in the whole tree
        (including Leaflet TileLayer throws) and shows a recovery UI instead of
        a blank page. Resolves ARCHITECTURE.md Known gap #3. */}
    <ErrorBoundary>
      {/* Suspense boundary handles async locale file loading from /locales/. */}
      <Suspense fallback={<div>Loading…</div>}>
        <BrandingProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </BrandingProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
