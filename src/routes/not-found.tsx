// not-found.tsx — Branded 404 page.
//
// Renders on any unknown route AND when a visitor navigates directly to a
// URL that corresponds to a hidden page (VisibilityGuard in App.tsx swaps
// hidden routes to this component).
//
// Design rules:
//   - sr-only <h1> satisfies heading hierarchy (axe page-has-heading-one).
//   - Operator logo rendered theme-aware (light/dark) from useBranding().
//   - Weather pun is deterministic from the URL path (no Math.random() to
//     avoid hydration mismatches / React StrictMode double-render surprises).
//   - "Back to Now" is a <Link> (not a <button>) — it navigates.
//   - WCAG AA: text-foreground + text-muted-foreground tokens, visible
//     focus ring on the link, alt text on logo image.

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useBranding } from '../lib/branding-provider';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  const branding = useBranding();

  // Puns are translated (common.json notFound.puns array) — returnObjects: true
  // is the established pattern for i18next arrays in this codebase (see legal.tsx).
  const puns = t('notFound.puns', { returnObjects: true }) as string[];

  // Select a pun deterministically from the current URL path so it stays
  // stable across re-renders but varies across different missing routes.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const hash = path.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pun = puns[hash % puns.length];

  // Theme-aware logo: read data-theme attribute set by the no-flash script.
  const isDark =
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') === 'dark'
      : false;
  const logoUrl = isDark
    ? (branding.logo?.dark ?? branding.logo?.light)
    : branding.logo?.light;
  const logoAlt = branding.logo?.alt ?? `${branding.siteTitle ?? ''} logo`.trim();

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center px-4">
      {/* sr-only h1 satisfies heading hierarchy / axe page-has-heading-one */}
      <h1 className="sr-only">{t('pageNotFound')}</h1>

      {logoUrl && (
        <img
          src={logoUrl}
          alt={logoAlt}
          className="h-16 w-auto object-contain"
        />
      )}

      <div className="flex flex-col items-center gap-2">
        <p
          className="text-foreground font-semibold"
          style={{ fontSize: 'var(--text-page-title)' }}
        >
          404
        </p>
        <p
          className="text-muted-foreground italic max-w-md"
          style={{ fontSize: 'var(--text-body)' }}
        >
          {pun}
        </p>
      </div>

      <Link
        to="/"
        className="text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded px-3 py-2"
        style={{ fontSize: 'var(--text-body)' }}
      >
        ← {t('backToNow', 'Back to Now')}
      </Link>
    </div>
  );
}

export default NotFoundPage;
