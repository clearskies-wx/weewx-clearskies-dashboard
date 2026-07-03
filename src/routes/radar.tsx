// radar.tsx — Full-viewport expanded radar route (/radar).
//
// Opened by the expand button on the radar card. Renders RadarMap
// full-screen as an overlay (no nav rail, no app header).
// Pressing Escape or clicking the close button navigates back.
//
// Station metadata is fetched here directly via useStation so this route
// works independently of the Now page's DataBag.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, Sliders } from '@phosphor-icons/react';
import { RadarMap } from '../components/shared/radar-map';
import { RadarLayerPanel } from '../components/shared/radar-layer-panel';
import { useStation, useCapabilities, useRadarFrames } from '../hooks/useWeatherData';
import { dismissSplash } from '../lib/dismiss-splash';

// localStorage key for persisting panel state + color scheme across sessions.
const STORAGE_KEY = 'clearskies-radar-panel';

function readStorage(): { open: boolean; colorScheme: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { open: false, colorScheme: 2 };
    const parsed = JSON.parse(raw) as { open?: boolean; colorScheme?: number };
    return {
      open: parsed.open !== false,
      colorScheme: parsed.colorScheme ?? 2,
    };
  } catch {
    return { open: false, colorScheme: 2 };
  }
}

export default function RadarPage() {
  useEffect(() => { dismissSplash(); }, []);
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

  // Fetch radar frames to access colorSchemes (returned alongside frame data).
  const providerId = radarCapability?.providerId ?? null;
  const { data: radarFrameList } = useRadarFrames(providerId);
  const colorSchemes = radarFrameList?.colorSchemes ?? null;

  // --- Panel + layer state ---
  const [panelOpen, setPanelOpen] = useState<boolean>(() => readStorage().open);
  // Opacity resets to 70% each session (intentionally not persisted).
  const [opacity, setOpacity] = useState<number>(0.7);
  const [colorScheme, setColorScheme] = useState<number>(() => readStorage().colorScheme);
  // Alert overlay: default on so users see active warnings immediately.
  const [showAlerts, setShowAlerts] = useState<boolean>(true);
  // Wind arrow overlay: default off — an opt-in layer.
  const [showWind, setShowWind] = useState<boolean>(false);
  // Satellite imagery overlay: default off — an opt-in layer.
  const [showSatellite, setShowSatellite] = useState<boolean>(() => {
    try {
      return localStorage.getItem('clearskies-radar-satellite') === 'true';
    } catch {
      return false;
    }
  });
  // Radar overlay: default on — the primary layer.
  const [showRadar, setShowRadar] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('clearskies-radar-show');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  // Derived alert/wind availability from capability declaration.
  const alertUrl = radarCapability?.alertUrl ?? null;
  const alertsAvailable = radarCapability?.alertsAvailable ?? false;
  // Wind tiles are LibreWxR-specific; available whenever that provider is active.
  const windAvailable = radarCapability?.providerId === 'librewxr';
  // Satellite imagery availability comes from the capability declaration.
  const satelliteAvailable = radarCapability?.satelliteAvailable ?? false;

  // Persist panel open/close and color scheme to localStorage whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: panelOpen, colorScheme }));
    } catch { /* ignore write errors (e.g. private browsing quota) */ }
  }, [panelOpen, colorScheme]);

  // Persist satellite toggle to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem('clearskies-radar-satellite', String(showSatellite));
    } catch { /* ignore write errors (e.g. private browsing quota) */ }
    if (showSatellite) setOpacity(1.0);
  }, [showSatellite]);

  // Persist radar toggle to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem('clearskies-radar-show', String(showRadar));
    } catch { /* ignore write errors */ }
  }, [showRadar]);

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
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <h1 className="text-lg font-semibold">{t('radarTitle')}</h1>
        <div className="flex items-center gap-1">
          {/* Settings toggle — opens/closes the layer panel */}
          <button
            type="button"
            onClick={() => setPanelOpen((p) => !p)}
            aria-label={t('layerSettings')}
            aria-expanded={panelOpen}
            className="rounded p-3 lg:p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Sliders className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t('closeRadar')}
            className="rounded p-3 lg:p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content area: map + optional layer panel side by side */}
      <div className="flex-1 min-h-0 flex">
        {/* Map area */}
        <div className="flex-1 min-h-0 p-3 relative z-0">
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
              opacity={opacity}
              colorScheme={colorScheme}
              showAlerts={showAlerts && alertsAvailable}
              alertUrl={alertUrl}
              showWind={showWind && windAvailable}
              caddyPrefix={radarCapability?.caddyPrefix ?? null}
              showSatellite={showSatellite && satelliteAvailable}
              showRadar={showRadar}
            />
          )}
        </div>

        {/* Layer panel — desktop sidebar; hidden when panelOpen is false */}
        {panelOpen && (
          <RadarLayerPanel
            providerId={radarCapability?.providerId ?? null}
            colorSchemes={colorSchemes}
            selectedColorScheme={colorScheme}
            onColorSchemeChange={setColorScheme}
            opacity={opacity}
            onOpacityChange={setOpacity}
            isOpen={panelOpen}
            onToggle={() => setPanelOpen(false)}
            alertsAvailable={alertsAvailable}
            showAlerts={showAlerts}
            onShowAlertsChange={setShowAlerts}
            windAvailable={windAvailable}
            showWind={showWind}
            onShowWindChange={setShowWind}
            satelliteAvailable={satelliteAvailable}
            showSatellite={showSatellite}
            onShowSatelliteChange={setShowSatellite}
            showRadar={showRadar}
            onShowRadarChange={setShowRadar}
          />
        )}
      </div>
    </div>
  );
}
