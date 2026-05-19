import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrandingProvider } from './lib/branding-provider'
import { ThemeProvider } from './lib/theme-provider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrandingProvider>
  </StrictMode>,
)
