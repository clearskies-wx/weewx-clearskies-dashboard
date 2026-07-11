// i18n/index.ts — i18next configuration (ADR-021).
// Import this module ONCE in main.tsx before React renders.
// Namespace-per-page strategy keeps JSON files small and enables per-page
// lazy loading via i18next-http-backend.
//
// Locale source (T2.6, DASHBOARD-MANUAL §3): the dashboard does NOT detect
// the visitor's browser/OS locale or read a `?lang=` query param. It starts
// at the safe default `en`, then AppLayout switches to the operator's
// configured `defaultLocale` (from StationMetadata) once station data loads
// via `i18n.changeLanguage()`. All visitors of a given station therefore see
// the same operator-chosen language — consistent with how the rest of the
// dashboard (units, timezone) is operator-configured, not visitor-detected.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

export const SUPPORTED_LOCALES = [
  "en",
  "de",
  "es",
  "fil",
  "fr",
  "it",
  "ja",
  "nl",
  "pt-PT",
  "pt-BR",
  "ru",
  "zh-CN",
  "zh-TW",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: "en", // safe default on cold start; AppLayout switches to StationMetadata.defaultLocale
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: "en",
    defaultNS: "common",
    ns: [
      "common",
      "now",
      "forecast",
      "charts",
      "almanac",
      "records",
      "seismic",
      "reports",
      "about",
      "legal",
      "nav",
      "radar",
      "weather",
      "marine",
    ],
    interpolation: {
      // React already escapes values in JSX; double-escaping would corrupt
      // strings like "&amp;" → "&&amp;".
      escapeValue: false,
    },
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    react: {
      // Suspense handles loading state; components can use useTranslation()
      // without guarding for undefined (the boundary shows the fallback UI).
      useSuspense: true,
    },
  });

export default i18n;
