import { useEffect, useState } from 'react';
import { checkConfigured, isMockMode } from '../api/client';
import { NotConfigured } from '../routes/not-configured';

const CACHE_KEY = 'clearskies.setup.configured';

type GuardState = 'checking' | 'ok' | 'notConfigured';

interface SetupGuardProps {
  children: React.ReactNode;
}

/**
 * Checks GET /api/v1/status once per session (see checkConfigured in
 * api/client.ts) before rendering the app. If the API reports
 * `configured: false` (life-support mode, ARCHITECTURE.md gap #2/#3), renders
 * NotConfigured instead of the app routes — a link to the setup wizard, not
 * an automatic redirect (the wizard may not yet be reachable at the
 * dashboard's own origin during first-run, before Caddy is configured).
 *
 * A network error or unreachable API is NOT treated as "not configured" —
 * checkConfigured() reports `configured: true` in that case, and the app
 * proceeds to render normally, leaving the global ErrorBoundary / per-tile
 * error states to surface the actual failure.
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const [state, setState] = useState<GuardState>(() => {
    if (isMockMode()) return 'ok';
    if (sessionStorage.getItem(CACHE_KEY) === 'true') return 'ok';
    return 'checking';
  });

  useEffect(() => {
    if (state !== 'checking') return;

    let cancelled = false;

    async function check() {
      const { configured } = await checkConfigured();
      if (cancelled) return;

      if (configured === false) {
        setState('notConfigured');
        return;
      }

      sessionStorage.setItem(CACHE_KEY, 'true');
      setState('ok');
    }

    void check();
    return () => { cancelled = true; };
  }, [state]);

  if (state === 'ok') return <>{children}</>;

  if (state === 'notConfigured') return <NotConfigured />;

  return null;
}
