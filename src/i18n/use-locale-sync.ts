// use-locale-sync.ts — syncs <html lang="…"> with the active i18next locale.
// Call once at the app root (App.tsx) so screen readers and search engines see
// the correct language attribute throughout the session (ADR-021 / WCAG 2.4.2).

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadFontsForLocale } from "./font-loader";

/**
 * Keeps document.documentElement.lang in sync with the active i18next locale.
 * The static index.html ships lang="en" as an SSR/before-hydration fallback;
 * this hook updates it once React renders and on every subsequent language change.
 *
 * Also triggers on-demand CJK font loading (T4.1) — a no-op for non-CJK
 * locales, so this has no cost for the majority of visitors.
 */
export function useLocaleSync(): void {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.setAttribute("lang", i18n.language);
    void loadFontsForLocale(i18n.language);
  }, [i18n.language]);
}
