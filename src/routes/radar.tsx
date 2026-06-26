// radar.tsx — Full-viewport expanded radar route (/radar).
//
// Opened by the expand button on the radar card. Renders RadarMap
// full-screen as an overlay (no nav rail, no app header).
// Pressing Escape or clicking the close button navigates back.
//
// Station metadata is fetched here directly via useStation so this route
// works independently of the Now page's DataBag.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { RadarMap } from '../components/shared/radar-map';
import { useStation, useCapabilities } from '../hooks/useWeatherData';

export default function RadarPage() {
  const { t } = useTranslation('radar');
  const navigate = useNavigate();

  const { data: station, loading: stationLoading } = useStation();
  const { data: capabilities } = useCapabilities();

  const radarCapability = capabilities?.providers.find((p) => p.domain === 'radar') ?? null;

  const maxBounds: [[number, number], [number, number]] | undefined =
    radarCapability?.bounds
      ? [
          [radarCapability.bounds.south, radarCapability.bounds.west],
          [radarCapability.bounds.north, radarCapability.bounds.east],
        ]
      : undefined;

  // Ref for the overlay div — used for focus trap.
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: Escape closes the expanded view.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        navigate(-1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Focus trap: keep keyboard focus within the overlay while it is open.
  // Restores focus to the previously focused element when unmounted.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // Save the element that had focus before we opened the dialog.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusable = overlay!.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    overlay.addEventListener('keydown', handleTab);

    // Focus the close button on mount so keyboard users can immediately dismiss.
    const closeBtn = overlay.querySelector<HTMLElement>('button');
    closeBtn?.focus();

    return () => {
      overlay.removeEventListener('keydown', handleTab);
      // Restore focus to whatever was focused before the dialog opened.
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-background flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={t('radarTitle')}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <h1 className="text-lg font-semibold">{t('radarTitle')}</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('closeRadar')}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-3">
        {stationLoading || station === null ? (
          <div
            className="h-full rounded-lg bg-muted animate-pulse"
            aria-hidden="true"
          />
        ) : (
          <RadarMap
            center={[station.latitude, station.longitude]}
            stationTz={station.timezone}
            zoom={7}
            expanded={true}
            maxBounds={maxBounds}
          />
        )}
      </div>
    </div>
  );
}
