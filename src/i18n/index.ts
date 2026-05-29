// i18n/index.ts — i18next configuration (ADR-021).
// Import this module ONCE in main.tsx before React renders.
// Namespace-per-page strategy keeps JSON files small and enables per-page
// lazy loading via i18next-http-backend.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

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
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
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
    ],
    interpolation: {
      // React already escapes values in JSX; double-escaping would corrupt
      // strings like "&amp;" → "&&amp;".
      escapeValue: false,
    },
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      // Preference order: explicit ?lang= override → persisted user choice →
      // browser's Accept-Language preference.
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "clearskies-locale",
      caches: ["localStorage"],
    },
    react: {
      // Suspense handles loading state; components can use useTranslation()
      // without guarding for undefined (the boundary shows the fallback UI).
      useSuspense: true,
    },
  });

export default i18n;
