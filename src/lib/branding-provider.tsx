// branding-provider.tsx — operator branding context (accent palette + logo + default theme mode).
// Phase 3: uses hardcoded defaults. No API fetch yet.
// TODO: replace DEFAULT_BRANDING with a fetch from clearskies-api /branding endpoint
// once that endpoint is defined in the OpenAPI contract (ADR-022).

import { createContext, useContext, useEffect, useMemo } from 'react';
import type { BrandingConfig } from './branding';
import { ACCENT_PALETTES, DEFAULT_BRANDING } from './branding';

const BrandingContext = createContext<BrandingConfig | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const config = DEFAULT_BRANDING;

  // Set CSS custom properties on <html> once so both :root and [data-theme="dark"]
  // blocks can reference --brand-* via var() without JS needing to know the resolved
  // theme. ThemeProvider's data-theme attribute handles the CSS-level switching.
  useEffect(() => {
    const palette = ACCENT_PALETTES[config.accent];
    const root = document.documentElement;
    root.style.setProperty('--brand-primary-light', palette.light);
    root.style.setProperty('--brand-primary-dark', palette.dark);
    root.style.setProperty('--brand-primary-fg-light', palette.lightForeground);
    root.style.setProperty('--brand-primary-fg-dark', palette.darkForeground);
  }, [config.accent]);

  // Memoize so consumers only re-render when config fields actually change.
  // Without this, every BrandingProvider render creates a new object reference
  // and triggers re-renders in all useBranding() consumers — which can close an
  // infinite loop if any consumer has a useEffect that writes state (T7 lesson).
  const value = useMemo<BrandingConfig>(() => ({ ...config }), [config]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingConfig {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error('useBranding must be used inside <BrandingProvider>');
  }
  return ctx;
}
