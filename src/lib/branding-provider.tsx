// branding-provider.tsx — operator branding context (accent palette + logo + default theme mode).
// Gap #10: fetches from clearskies-api GET /branding on mount.
// Falls back to DEFAULT_BRANDING on API error or in mock mode.
//
// Mapping note: the API response uses logo.lightUrl / logo.darkUrl to match
// the OpenAPI contract; the internal BrandingConfig uses logo.light / logo.dark.
// The mapping happens here at the provider boundary so consumers are isolated
// from the wire format.

import { createContext, useContext, useEffect, useMemo } from 'react';
import type { BrandingConfig } from './branding';
import { ACCENT_PALETTES, DEFAULT_BRANDING } from './branding';
import type { AccentName } from './branding';
import { useBrandingApi } from '../hooks/useWeatherData';

export const BrandingContext = createContext<BrandingConfig | null>(null);

/** Coerce the raw API accent string into a known AccentName, defaulting to 'blue'. */
function toAccentName(raw: string): AccentName {
  const known: AccentName[] = ['blue', 'teal', 'indigo', 'purple', 'green', 'amber'];
  return (known as string[]).includes(raw) ? (raw as AccentName) : 'blue';
}

/** Coerce the raw API theme-mode string into the internal union, defaulting to 'auto-os'. */
function toThemeMode(raw: string): BrandingConfig['defaultThemeMode'] {
  const known: BrandingConfig['defaultThemeMode'][] = [
    'light', 'dark', 'auto-os', 'auto-sunrise-sunset',
  ];
  return (known as string[]).includes(raw)
    ? (raw as BrandingConfig['defaultThemeMode'])
    : 'auto-os';
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: apiData } = useBrandingApi();

  // Map API response → internal BrandingConfig; fall back to DEFAULT_BRANDING
  // if the fetch has not yet completed or returned null (network error, 404, etc.).
  const config = useMemo<BrandingConfig>(() => {
    if (!apiData) return DEFAULT_BRANDING;

    return {
      accent: toAccentName(apiData.accent),
      defaultThemeMode: toThemeMode(apiData.defaultThemeMode),
      logo: apiData.logo
        ? {
            light: apiData.logo.lightUrl,
            dark: apiData.logo.darkUrl,
            alt: apiData.logo.alt,
          }
        : undefined,
      customCssUrl: apiData.customCssUrl ?? null,
      siteTitle: apiData.siteTitle,
      faviconUrl: apiData.faviconUrl,
    };
  }, [apiData]);

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

  // Apply siteTitle to document.title when the operator has configured one.
  useEffect(() => {
    if (config.siteTitle && config.siteTitle.trim().length > 0) {
      document.title = config.siteTitle;
    }
  }, [config.siteTitle]);

  // Apply faviconUrl to the <link rel="icon"> element.
  // Creates the element if it doesn't exist yet (SSR-safe: runs client-side only).
  useEffect(() => {
    if (!config.faviconUrl || config.faviconUrl.trim().length === 0) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = config.faviconUrl;
  }, [config.faviconUrl]);

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
