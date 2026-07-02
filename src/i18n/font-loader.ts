// font-loader.ts — on-demand CJK web font loading (T4.1).
//
// Latin/Cyrillic subsets for Manrope, Outfit, and Lexend are imported eagerly
// in src/index.css (cheap, ~20-50 KB total, needed by every locale including
// Russian). CJK glyph coverage is expensive by comparison (each Noto Sans
// weight is several hundred KB), so it is loaded dynamically and only for
// visitors who actually select a CJK locale — Latin/European visitors pay
// zero byte cost for it. See DASHBOARD-MANUAL.md §3 "CJK fonts" and
// DESIGN-MANUAL.md §4 "Font Families".
//
// Vite code-splits each dynamic import() into its own chunk, so these never
// land in the main bundle (verified via the T4.1 build output).

const loaded = new Set<string>();

/**
 * Load the Noto Sans CJK font weights (400/600/700) for the given locale,
 * if that locale requires CJK glyph coverage. No-ops for all other locales.
 * Idempotent — safe to call on every locale change; each locale's font CSS
 * is fetched at most once per session (browser HTTP cache persists it
 * across sessions after the first load).
 */
export async function loadFontsForLocale(locale: string): Promise<void> {
  if (loaded.has(locale)) return;

  switch (locale) {
    case "ja":
      await Promise.all([
        import("@fontsource/noto-sans-jp/400.css"),
        import("@fontsource/noto-sans-jp/600.css"),
        import("@fontsource/noto-sans-jp/700.css"),
      ]);
      break;
    case "zh-CN":
      await Promise.all([
        import("@fontsource/noto-sans-sc/400.css"),
        import("@fontsource/noto-sans-sc/600.css"),
        import("@fontsource/noto-sans-sc/700.css"),
      ]);
      break;
    case "zh-TW":
      await Promise.all([
        import("@fontsource/noto-sans-tc/400.css"),
        import("@fontsource/noto-sans-tc/600.css"),
        import("@fontsource/noto-sans-tc/700.css"),
      ]);
      break;
    default:
      return; // No CJK font needed for this locale.
  }

  loaded.add(locale);
}
