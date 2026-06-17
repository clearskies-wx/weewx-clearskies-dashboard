import { useEffect, useState } from 'react';
import { isMockMode } from '../api/client';

const CACHE_KEY = 'clearskies.setup.configured';

const STATUS_URL: string =
  `${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1'}/status`;

type GuardState = 'checking' | 'ok' | 'unreachable';

interface SetupGuardProps {
  children: React.ReactNode;
}

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
      try {
        const res = await fetch(STATUS_URL, {
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;

        const body = (await res.json()) as { configured: boolean };
        if (cancelled) return;

        if (body.configured === false) {
          window.location.href = '/wizard';
          return;
        }

        sessionStorage.setItem(CACHE_KEY, 'true');
        setState('ok');
      } catch {
        if (!cancelled) setState('unreachable');
      }
    }

    void check();
    return () => { cancelled = true; };
  }, [state]);

  if (state === 'ok') return <>{children}</>;

  if (state === 'unreachable') {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <main
          className="flex flex-1 flex-col items-center justify-center gap-6 px-4"
          aria-labelledby="setup-guard-heading"
        >
          <h1
            id="setup-guard-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            Clear Skies is starting up...
          </h1>
          <p className="text-muted-foreground text-center max-w-sm">
            The weather station API is not responding yet. It may still be initialising.
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:opacity-90 transition-opacity"
            style={{ fontSize: 'var(--text-label)' }}
            onClick={() => setState('checking')}
          >
            Retry
          </button>
        </main>
      </div>
    );
  }

  return null;
}
