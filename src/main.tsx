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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Suspense boundary handles async locale file loading from /locales/. */}
    <Suspense fallback={<div>Loading…</div>}>
      <BrandingProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </BrandingProvider>
    </Suspense>
  </StrictMode>,
)
