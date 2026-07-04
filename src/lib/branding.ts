export type AccentName = 'blue' | 'teal' | 'indigo' | 'purple' | 'green' | 'amber';

export interface AccentPalette {
  light: string;
  dark: string;
  lightForeground: string;
  darkForeground: string;
}

export interface BrandingConfig {
  accent: AccentName;
  defaultThemeMode: 'light' | 'dark' | 'auto-os' | 'auto-sunrise-sunset';
  logo?: { light: string; dark?: string; alt: string };
  /** Optional page title to set on document.title. */
  siteTitle?: string;
  /** URL for the site favicon, applied to <link rel="icon">. */
  faviconUrl?: string;
  /** Copyright entity name shown in the footer. Falls back to station name if not set. */
  copyrightEntity?: string;
  /**
   * Comma-separated list of continent slugs for privacy/accessibility jurisdiction filtering.
   * E.g. "north-america,europe". Use "global" or leave undefined to show all jurisdictions.
   * Phase 4 will wire this to the API; until then it is always undefined → treated as "global".
   */
  privacyRegions?: string;
  /**
   * GA4 Measurement ID (e.g. "G-XXXXXXXXXX"). When set to a non-empty string the dashboard
   * shows the cookie consent banner and loads GA only after explicit acceptance.
   * Absent or empty string → no GA, no banner shown.
   */
  googleAnalyticsId?: string;
  /** URL of the operator's weather station photo (set via the setup wizard). */
  stationPhotoUrl?: string;
  /** Alt text for the station photo. Falls back to a generic description if not set. */
  stationPhotoAlt?: string;
  /** Operator-authored "About This Station" content (plain text / markdown). */
  aboutContent?: string;
  /** Custom Terms of Use markdown (replaces default if non-empty). */
  customTermsMd?: string;
  /** Custom Privacy Policy markdown (replaces default if non-empty). */
  customPrivacyMd?: string;
}

// Curated palette — all light values verified ≥4.5:1 on white (oklch(1 0 0));
// all dark values verified ≥4.5:1 on oklch(0.145 0 0). Free-form picker is
// intentionally not offered so WCAG AA compliance cannot be broken by an operator
// choosing an arbitrary brand colour (ADR-022).
export const ACCENT_PALETTES: Record<AccentName, AccentPalette> = {
  blue: {
    light: 'oklch(0.48 0.22 260)',
    dark: 'oklch(0.70 0.15 260)',
    lightForeground: 'oklch(1 0 0)',
    darkForeground: 'oklch(0.15 0 0)',
  },
  teal: {
    light: 'oklch(0.46 0.10 185)',
    dark: 'oklch(0.72 0.09 185)',
    lightForeground: 'oklch(1 0 0)',
    darkForeground: 'oklch(0.15 0 0)',
  },
  indigo: {
    light: 'oklch(0.42 0.22 280)',
    dark: 'oklch(0.68 0.15 280)',
    lightForeground: 'oklch(1 0 0)',
    darkForeground: 'oklch(0.15 0 0)',
  },
  purple: {
    light: 'oklch(0.45 0.20 305)',
    dark: 'oklch(0.70 0.14 305)',
    lightForeground: 'oklch(1 0 0)',
    darkForeground: 'oklch(0.15 0 0)',
  },
  green: {
    light: 'oklch(0.46 0.14 150)',
    dark: 'oklch(0.72 0.12 150)',
    lightForeground: 'oklch(1 0 0)',
    darkForeground: 'oklch(0.15 0 0)',
  },
  amber: {
    light: 'oklch(0.50 0.14 75)',
    dark: 'oklch(0.78 0.12 75)',
    lightForeground: 'oklch(1 0 0)',
    darkForeground: 'oklch(0.15 0 0)',
  },
};

export const DEFAULT_BRANDING: BrandingConfig = {
  accent: 'blue',
  defaultThemeMode: 'auto-os',
};
