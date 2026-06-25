// radar-expanded.tsx — T4.1–T4.9
// Full-viewport expanded radar overlay page at /radar.
//
// Renders RadarMap in expanded mode (full frame history), with:
//   T4.2 — RadarTimeSlider: play/pause, speed, scrub, arrow keys
//   T4.3 — RadarLayerPanel: layer toggles grouped by type, localStorage
//   T4.4 — Color scheme picker (via RadarLayerPanel, LibreWxR only)
//   T4.5 — Opacity slider (via RadarLayerPanel)
//   T4.6 — Satellite WMS TileLayer rendering (wired via enabledLayers)
//   T4.7 — SPC overlay GeoJSON rendering (wired via enabledLayers)
//   T4.8 — Alert polygon rendering (wired via enabledLayers)
//   T4.9 — WCAG 2.1 AA accessibility audit (focus trap, Escape, keyboard nav,
//           prefers-reduced-motion, aria-live layer announcements)
//
// Accessibility:
//   - role="dialog", aria-modal="true", aria-label
//   - Focus trap: on mount, saves previously-focused element; restores on close
//   - Escape key closes; close button (X) also navigates back
//   - All interactive controls keyboard-reachable with visible focus indicator
//   - prefers-reduced-motion: animation starts paused (via RadarTimeSlider)
//   - Layer changes announced via aria-live region

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { RadarMap } from '../components/shared/radar-map';
import { RadarTimeSlider } from '../components/shared/radar-time-slider';
import { RadarLayerPanel } from '../components/shared/radar-layer-panel';
import { useStation, useCapabilities } from '../hooks/useWeatherData';
import type { RadarFrame, CapabilityDeclaration } from '../api/types';

// ---------------------------------------------------------------------------
// Focus trap helpers
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => !el.closest('[hidden]') && el.offsetParent !== null,
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function RadarExpandedPage() {
  const navigate = useNavigate();

  // Station data for map center and timezone.
  const { data: station } = useStation();
  // Capabilities for layer panel (provider-adaptive layers).
  const { data: capabilities } = useCapabilities();

  const radarCapability: CapabilityDeclaration | null =
    capabilities?.providers.find((p) => p.domain === 'radar') ?? null;

  // Map center: station coordinates, or a continental US fallback.
  const center: [number, number] = station
    ? [station.latitude, station.longitude]
    : [39.5, -98.35];
  const stationTz = station?.timezone;

  // ---------------------------------------------------------------------------
  // T4.2 — Animation state (lifted here so TimeSlider drives RadarMap)
  // ---------------------------------------------------------------------------

  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  const handleFramesLoaded = useCallback((loaded: RadarFrame[]) => {
    setFrames(loaded);
    setCurrentFrameIndex(0);
  }, []);

  const handleFrameChange = useCallback((index: number) => {
    setCurrentFrameIndex(index);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const handlePlayingChange = useCallback((_playing: boolean) => {
    // RadarMap's internal timer is suppressed when externalFrameIndex is set.
    // TimeSlider owns playback; this callback is available for future extensions.
  }, []);

  // ---------------------------------------------------------------------------
  // T4.4/T4.5 — Color scheme and opacity from LayerPanel
  // ---------------------------------------------------------------------------

  const [colorScheme, setColorScheme] = useState<number>(2); // "Universal Blue"
  const [opacity, setOpacity] = useState<number>(0.7);       // matches MAX_OPACITY

  const handleColorSchemeChange = useCallback((id: number) => {
    setColorScheme(id);
  }, []);

  const handleOpacityChange = useCallback((value: number) => {
    setOpacity(value);
  }, []);

  // T4.6–T4.8 — Enabled layer IDs from the layer panel.
  // Passed to RadarMap to control satellite, SPC overlay, and alert polygon rendering.
  const [enabledLayers, setEnabledLayers] = useState<Set<string>>(new Set<string>());

  // T4.3 — Layer toggle handler: stores the full enabled-layer set from the panel
  // and passes it down to RadarMap so non-radar layers can be shown/hidden.
  const handleLayerToggle = useCallback((enabledIds: Set<string>) => {
    setEnabledLayers(enabledIds);
  }, []);

  // ---------------------------------------------------------------------------
  // Focus trap
  // ---------------------------------------------------------------------------

  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // On mount: save focus, move focus into dialog.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    // Move focus to first focusable element inside the overlay.
    const timer = setTimeout(() => {
      if (overlayRef.current) {
        const focusable = getFocusableElements(overlayRef.current);
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50); // small delay so the DOM is fully painted
    return () => clearTimeout(timer);
  }, []);

  // On unmount: restore focus to previously focused element.
  useEffect(() => {
    return () => {
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus();
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    // navigate(-1) when there's history; fall back to home when the user
    // landed directly on /radar (no prior page to return to).
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Tab-cycle focus within the overlay (focus trap).
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }

    if (e.key === 'Tab' && overlayRef.current) {
      const focusable = getFocusableElements(overlayRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [handleClose]);

  return (
    // Full-viewport overlay. z-50 places it above the nav rail (z-20) and all
    // page content. role="dialog" + aria-modal="true" for screen reader focus trap.
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded radar view"
      // tabIndex={-1} allows the div to receive keyboard events without being in
      // the natural tab order. The :focus ring on this container is suppressed
      // via focus:outline-none — this element is never in the user's Tab sequence,
      // only reached programmatically, so no replacement focus indicator is needed.
      tabIndex={-1}
      className="fixed inset-0 z-50 focus:outline-none"
      onKeyDown={handleKeyDown}
    >
      {/* Map fills the entire overlay */}
      <div className="absolute inset-0">
        <RadarMap
          center={center}
          zoom={7}
          stationTz={stationTz}
          expanded={true}
          externalFrameIndex={currentFrameIndex}
          onFramesLoaded={handleFramesLoaded}
          opacityOverride={opacity}
          colorSchemeOverride={colorScheme}
          enabledLayers={enabledLayers}
        />
      </div>

      {/* T4.9 — aria-live region for layer toggle announcements.
          sr-only: visually hidden but announced to screen readers when content changes.
          Announces which layers are currently active so AT users know what changed. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {enabledLayers.size > 0
          ? `Active layers: ${Array.from(enabledLayers).join(', ')}`
          : 'No overlay layers active'}
      </div>

      {/* Close button — top-right, 44×44px, above all other controls (z-40) */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close expanded radar"
        className="absolute top-2 right-2 z-40 flex items-center justify-center rounded-lg text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        style={{
          background: 'rgb(var(--card-glass))',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          minWidth: '44px',
          minHeight: '44px',
        }}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Layer panel — T4.3, T4.4, T4.5 — z-30, right side
          (toggle button is positioned inside the panel at top-14 right-2) */}
      <RadarLayerPanel
        capability={radarCapability}
        onLayerToggle={handleLayerToggle}
        onColorSchemeChange={handleColorSchemeChange}
        onOpacityChange={handleOpacityChange}
      />

      {/* Time slider — T4.2 — z-20, bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <RadarTimeSlider
          frames={frames}
          currentFrameIndex={currentFrameIndex}
          onFrameChange={handleFrameChange}
          onPlayingChange={handlePlayingChange}
          stationTz={stationTz}
        />
      </div>
    </div>
  );
}
