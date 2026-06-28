// radar-layer-panel.tsx — Collapsible settings panel for the expanded radar view.
//
// Desktop: sidebar (w-72) on the right side of the map, separated by a border.
// Mobile: simplified — same sidebar content; full bottom-sheet drag gestures deferred.
//
// Controls:
//   • Opacity slider (always shown) — 0–100%, stored as 0–1 float.
//   • Color scheme picker (LibreWxR only) — shown only when colorSchemes is non-empty.
//
// localStorage: panel open/closed state + selected color scheme are persisted.
// Opacity intentionally resets to 70% each session (not persisted).

import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';

export interface RadarLayerPanelProps {
  /** Active radar provider ID (used for display; color picker shown when colorSchemes is non-null). */
  providerId: string | null;
  /** Available color schemes; null/empty means the provider doesn't support scheme selection. */
  colorSchemes: Array<{ id: number; name: string }> | null;
  /** Currently selected color scheme ID. */
  selectedColorScheme: number;
  /** Called when the user selects a different color scheme. */
  onColorSchemeChange: (id: number) => void;
  /** Current opacity value 0–1. */
  opacity: number;
  /** Called when the user changes the opacity slider. */
  onOpacityChange: (val: number) => void;
  /** Whether the panel is currently open. */
  isOpen: boolean;
  /** Called to toggle or close the panel. */
  onToggle: () => void;
  // --- Overlay toggles (LibreWxR only) ---
  /** When true, show the "Weather alerts" toggle. */
  alertsAvailable?: boolean;
  /** Whether the alert overlay is currently enabled. */
  showAlerts: boolean;
  /** Called when the user toggles the alert overlay. */
  onShowAlertsChange: (val: boolean) => void;
  /** When true, show the "Wind arrows" toggle. */
  windAvailable?: boolean;
  /** Whether the wind arrow overlay is currently enabled. */
  showWind: boolean;
  /** Called when the user toggles the wind arrow overlay. */
  onShowWindChange: (val: boolean) => void;
  /** When true, show the "Satellite imagery" toggle. */
  satelliteAvailable?: boolean;
  /** Whether the satellite overlay is currently enabled. */
  showSatellite: boolean;
  /** Called when the user toggles the satellite overlay. */
  onShowSatelliteChange: (val: boolean) => void;
}

export function RadarLayerPanel({
  colorSchemes,
  selectedColorScheme,
  onColorSchemeChange,
  opacity,
  onOpacityChange,
  onToggle,
  alertsAvailable,
  showAlerts,
  onShowAlertsChange,
  windAvailable,
  showWind,
  onShowWindChange,
  satelliteAvailable,
  showSatellite,
  onShowSatelliteChange,
}: RadarLayerPanelProps) {
  const { t } = useTranslation('radar');

  return (
    <aside
      className="w-72 flex-shrink-0 border-l bg-background flex flex-col overflow-hidden"
      aria-label={t('layerSettings')}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0">
        <h2 className="text-sm font-semibold">{t('layerSettings')}</h2>
        <button
          type="button"
          onClick={onToggle}
          aria-label={t('closePanel')}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Panel body */}
      <div className="p-3 space-y-5 overflow-y-auto flex-1">
        {/* Opacity slider */}
        <div>
          <label
            htmlFor="radar-opacity"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
          >
            {t('opacity')} — {Math.round(opacity * 100)}%
          </label>
          <input
            id="radar-opacity"
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(parseInt(e.target.value, 10) / 100)}
            className="w-full accent-primary"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(opacity * 100)}
            aria-valuetext={`${Math.round(opacity * 100)}%`}
          />
        </div>

        {/* Color scheme picker — only shown when provider exposes color schemes */}
        {colorSchemes && colorSchemes.length > 0 && (
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-2">
              {t('colorScheme')}
            </span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('colorScheme')}>
              {colorSchemes.map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  onClick={() => onColorSchemeChange(scheme.id)}
                  className={`text-xs px-2 py-1.5 rounded border transition-colors ${
                    selectedColorScheme === scheme.id
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/50'
                  }`}
                  aria-pressed={selectedColorScheme === scheme.id}
                >
                  {scheme.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Layer toggles — LibreWxR only.
            Shown when at least one overlay type is available for this provider. */}
        {(alertsAvailable || windAvailable || satelliteAvailable) && (
          <div>
            <span className="text-xs font-medium text-muted-foreground block mb-2">
              {t('layers')}
            </span>
            <div className="space-y-2">
              {alertsAvailable && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAlerts}
                    onChange={(e) => onShowAlertsChange(e.target.checked)}
                    className="accent-primary"
                  />
                  {t('weatherAlerts')}
                </label>
              )}
              {windAvailable && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWind}
                    onChange={(e) => onShowWindChange(e.target.checked)}
                    className="accent-primary"
                  />
                  {t('windArrows')}
                </label>
              )}
              {satelliteAvailable && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSatellite}
                    onChange={(e) => onShowSatelliteChange(e.target.checked)}
                    className="accent-primary"
                    aria-label={t('satelliteImagery')}
                  />
                  {t('satelliteImagery')}
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default RadarLayerPanel;
