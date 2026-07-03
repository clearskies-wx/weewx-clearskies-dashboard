// not-configured.tsx — First-run message shown when the Clear Skies API is
// running in life-support mode (no api.conf yet — ARCHITECTURE.md gap #2/#3).
//
// Rendered by SetupGuard in place of the app routes when GET /api/v1/status
// reports `configured: false`. Does NOT auto-redirect to /wizard: before
// Caddy is configured, the setup wizard runs on its own port and is not yet
// proxied under the dashboard's own origin, so a hard redirect could 404 or
// land on the wrong service. Instead this shows the wizard URL as a link the
// operator clicks manually once the wizard is reachable.
//
// Design rules:
//   - Centered card (`.card-glass`, `rounded-xl`, `ring-1 ring-foreground/10`
//     per DESIGN-MANUAL.md §6 Card Anatomy), matching the minimal recovery-UI
//     pattern used by error-boundary.tsx.
//   - Real (non-sr-only) <h1> — this is effectively the whole page at this
//     point in first-run.
//   - WCAG AA: text-foreground / text-muted-foreground tokens, visible focus
//     ring on the link, and the link text states its destination explicitly
//     rather than relying on a bare URL (WCAG 2.4.4 Link Purpose).

import { useTranslation } from 'react-i18next';

export function NotConfigured() {
  const { t } = useTranslation('common');

  const wizardUrl =
    typeof window !== 'undefined'
      ? `https://${window.location.hostname}/wizard`
      : '/wizard';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="card-glass flex max-w-md flex-col items-center gap-4 rounded-xl p-[var(--card-pad)] text-center ring-1 ring-foreground/10">
        <h1
          className="text-foreground font-semibold"
          style={{ fontSize: 'var(--text-page-title)' }}
        >
          {t('setup.notConfigured', 'Clear Skies is not yet configured')}
        </h1>
        <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
          {t('setup.notConfiguredBody', 'Open the setup wizard to get started.')}
        </p>
        <a
          href={wizardUrl}
          className="rounded px-1 py-1 text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ fontSize: 'var(--text-body)' }}
        >
          {t('setup.openWizardLink', 'Open the setup wizard: {{url}}', { url: wizardUrl })}
        </a>
      </div>
    </div>
  );
}

export default NotConfigured;
