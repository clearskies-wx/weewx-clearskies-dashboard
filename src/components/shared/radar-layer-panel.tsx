// radar-layer-panel.tsx — T4.3, T4.4, T4.5
// Collapsible layer panel for the expanded radar view (/radar page).
//
// Desktop: right sidebar (width 280px) toggled by a button.
// Mobile: collapsible panel anchored to the bottom-right.
// Contains:
//   - Layer list (T4.3): grouped by type, checkboxes, localStorage-persisted state
//   - Color scheme picker (T4.4): LibreWxR only, dropdown, localStorage-persisted
//   - Opacity slider (T4.5): 0-100%, default 70%, localStorage-persisted

import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, X } from '@phosphor-icons/react';
import type { LayerDeclaration, CapabilityDeclaration } from '../../api/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_LAYER_STATE_KEY = 'clearskies.radar-layers';
const LS_COLOR_SCHEME_KEY = 'clearskies.radar-color-scheme';
const LS_OPACITY_KEY = 'clearskies.radar-opacity';

const DEFAULT_OPACITY_PCT = 70; // matches MAX_OPACITY = 0.7 in radar-map.tsx
const DEFAULT_COLOR_SCHEME = 2;  // "Universal Blue"

// T4.4 — LibreWxR color scheme list (13 schemes).
// Source: LibreWxR API documentation (see docs/reference/api-docs/librewxr.md).
export const LIBREWXR_COLOR_SCHEMES = [
  { id: 0, name: 'Black and White' },
  { id: 1, name: 'Rainviewer Original' },
  { id: 2, name: 'Universal Blue' },
  { id: 3, name: 'TITAN' },
  { id: 4, name: 'The Weather Channel' },
  { id: 5, name: 'Meteored' },
  { id: 6, name: 'NEXRAD Level III' },
  { id: 7, name: 'Rainbow' },
  { id: 8, name: 'Dark Sky' },
  { id: 9, name: 'Datameteo Valerio' },
  { id: 10, name: 'Viper HD' },
  { id: 11, name: 'MRMS CREF' },
] as const;

// Layer type labels for section headers.
const LAYER_TYPE_LABELS: Record<LayerDeclaration['layerType'], string> = {
  radar: 'Radar',
  satellite: 'Satellite',
  overlay: 'Overlay',
  alerts: 'Alerts',
};

// Ordered display sequence for layer type sections.
const LAYER_TYPE_ORDER: LayerDeclaration['layerType'][] = [
  'radar',
  'satellite',
  'overlay',
  'alerts',
];

// ---------------------------------------------------------------------------
// localStorage helpers (safe — silently ignore storage errors)
// ---------------------------------------------------------------------------

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable — silently discard.
  }
}

// Build the default checked-state map from the capability's layer list.
// Layers with defaultEnabled=true start checked; others start unchecked.
function buildDefaultLayerState(layers: LayerDeclaration[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const layer of layers) {
    state[layer.layerId] = layer.defaultEnabled;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RadarLayerPanelProps {
  /** The active radar provider capability (null while loading). */
  capability: CapabilityDeclaration | null;
  /** Called when the checked set of layer IDs changes. */
  onLayerToggle: (enabledLayerIds: Set<string>) => void;
  /** Called when the color scheme changes (LibreWxR only). */
  onColorSchemeChange: (schemeId: number) => void;
  /** Called when the opacity changes (0–1 float). */
  onOpacityChange: (opacity: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RadarLayerPanel({
  capability,
  onLayerToggle,
  onColorSchemeChange,
  onOpacityChange,
}: RadarLayerPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // T4.3 — Layer checked state (layerId → boolean).
  // Initialised from localStorage, falling back to capability defaults.
  const [layerState, setLayerState] = useState<Record<string, boolean>>(() => {
    const saved = readLocalStorage<Record<string, boolean>>(LS_LAYER_STATE_KEY, {});
    return saved;
  });

  // T4.4 — Color scheme (LibreWxR only).
  const [colorScheme, setColorScheme] = useState<number>(() =>
    readLocalStorage<number>(LS_COLOR_SCHEME_KEY, DEFAULT_COLOR_SCHEME),
  );

  // T4.5 — Opacity percentage (0–100).
  const [opacityPct, setOpacityPct] = useState<number>(() =>
    readLocalStorage<number>(LS_OPACITY_KEY, DEFAULT_OPACITY_PCT),
  );

  // Sync color scheme to parent and localStorage.
  useEffect(() => {
    writeLocalStorage(LS_COLOR_SCHEME_KEY, colorScheme);
    onColorSchemeChange(colorScheme);
  }, [colorScheme, onColorSchemeChange]);

  // Sync opacity to parent and localStorage.
  useEffect(() => {
    writeLocalStorage(LS_OPACITY_KEY, opacityPct);
    onOpacityChange(opacityPct / 100);
  }, [opacityPct, onOpacityChange]);

  // When capability loads (or changes provider), merge saved state with defaults.
  // Layers absent from localStorage get their defaultEnabled value; saved layers keep theirs.
  const layers = capability?.layers ?? null;
  useEffect(() => {
    if (!layers || layers.length === 0) return;
    const defaults = buildDefaultLayerState(layers);
    setLayerState((prev) => {
      const merged: Record<string, boolean> = { ...defaults };
      for (const [id, val] of Object.entries(prev)) {
        if (id in defaults) merged[id] = val;
      }
      return merged;
    });
  }, [layers]);

  // Build effective enabled-layers set and notify parent whenever layerState changes.
  useEffect(() => {
    const enabled = new Set<string>(
      Object.entries(layerState)
        .filter(([, checked]) => checked)
        .map(([id]) => id),
    );
    writeLocalStorage(LS_LAYER_STATE_KEY, layerState);
    onLayerToggle(enabled);
  }, [layerState, onLayerToggle]);

  const handleLayerToggle = useCallback((layerId: string, checked: boolean) => {
    setLayerState((prev) => ({ ...prev, [layerId]: checked }));
  }, []);

  const providerId = capability?.providerId ?? null;
  const isLibreWxR = providerId === 'librewxr';

  // Group layers by type in display order.
  const layersByType: Partial<Record<LayerDeclaration['layerType'], LayerDeclaration[]>> = {};
  if (layers) {
    for (const layer of layers) {
      if (!layersByType[layer.layerType]) layersByType[layer.layerType] = [];
      layersByType[layer.layerType]!.push(layer);
    }
  }

  // For single-layer providers (no layers array), synthesise a single radar entry
  // so the panel always shows something useful.
  const hasSyntheticLayer = !layers || layers.length === 0;
  const syntheticLayerId = providerId ? `${providerId}-radar` : 'radar';

  return (
    <>
      {/* Toggle button — always visible, anchored to top-right of the overlay */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Toggle layer panel"
        aria-expanded={isOpen}
        aria-controls="radar-layer-panel"
        className="absolute top-14 right-2 z-30 flex items-center justify-center rounded-lg text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        style={{
          background: 'rgb(var(--card-glass))',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          minWidth: '44px',
          minHeight: '44px',
        }}
      >
        <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Panel — desktop right sidebar / mobile bottom-right collapsible */}
      {isOpen && (
        <div
          id="radar-layer-panel"
          role="region"
          aria-label="Radar layer controls"
          className="absolute top-0 right-0 bottom-[56px] z-20 overflow-y-auto"
          style={{
            width: '280px',
            background: 'rgb(var(--card-glass))',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            // On mobile, switch to a bottom panel covering partial height
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
            <span
              className="font-semibold text-foreground"
              style={{ fontSize: 'var(--text-label)', fontWeight: 600 }}
            >
              Layers
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close layer panel"
              className="flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              style={{ minWidth: '32px', minHeight: '32px' }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Panel body */}
          <div className="px-4 py-3 flex flex-col gap-4">

            {/* Opacity slider — T4.5 */}
            <div>
              <label
                htmlFor="radar-opacity"
                className="block font-semibold text-foreground mb-2"
                style={{ fontSize: 'var(--text-label)', fontWeight: 600 }}
              >
                Radar Opacity: {opacityPct}%
              </label>
              <input
                id="radar-opacity"
                type="range"
                min={0}
                max={100}
                value={opacityPct}
                onChange={(e) => setOpacityPct(Number(e.target.value))}
                className="w-full h-1.5 appearance-none rounded-full cursor-pointer
                  bg-foreground/20
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:w-4
                  [&::-moz-range-thumb]:h-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Radar opacity"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={opacityPct}
              />
            </div>

            {/* Color scheme picker — T4.4, LibreWxR only */}
            {isLibreWxR && (
              <div>
                <label
                  htmlFor="radar-color-scheme"
                  className="block font-semibold text-foreground mb-2"
                  style={{ fontSize: 'var(--text-label)', fontWeight: 600 }}
                >
                  Color Scheme
                </label>
                <select
                  id="radar-color-scheme"
                  value={colorScheme}
                  onChange={(e) => setColorScheme(Number(e.target.value))}
                  className="w-full rounded-md border border-foreground/20 bg-background text-foreground px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontSize: 'var(--text-label)' }}
                >
                  {LIBREWXR_COLOR_SCHEMES.map((scheme) => (
                    <option key={scheme.id} value={scheme.id}>
                      {scheme.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-foreground/10" />

            {/* Layer list — T4.3 */}
            <div role="group" aria-label="Map layers" aria-live="polite">
              {/* Synthetic single-layer entry for providers without a layers array */}
              {hasSyntheticLayer && (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-muted-foreground font-semibold uppercase tracking-wide"
                    style={{ fontSize: 'var(--text-micro)', fontWeight: 600 }}
                  >
                    Radar
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layerState[syntheticLayerId] ?? true}
                      onChange={(e) => handleLayerToggle(syntheticLayerId, e.target.checked)}
                      className="w-4 h-4 rounded border-foreground/30 accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span style={{ fontSize: 'var(--text-label)' }} className="text-foreground">
                      {providerId === 'librewxr' ? 'LibreWxR Radar' :
                       providerId === 'rainviewer' ? 'RainViewer Radar' :
                       'Radar'}
                    </span>
                    <span
                      className="ml-auto px-1.5 py-0.5 rounded-full text-muted-foreground"
                      style={{
                        fontSize: 'var(--text-micro)',
                        background: 'var(--muted)',
                      }}
                    >
                      Radar
                    </span>
                  </label>
                </div>
              )}

              {/* Multi-layer providers: grouped by layerType */}
              {!hasSyntheticLayer && LAYER_TYPE_ORDER.map((layerType) => {
                const typeLayers = layersByType[layerType];
                if (!typeLayers || typeLayers.length === 0) return null;

                return (
                  <div key={layerType} className="flex flex-col gap-2 mb-3">
                    <span
                      className="text-muted-foreground font-semibold uppercase tracking-wide"
                      style={{ fontSize: 'var(--text-micro)', fontWeight: 600 }}
                    >
                      {LAYER_TYPE_LABELS[layerType]}
                    </span>
                    {typeLayers.map((layer) => (
                      <label
                        key={layer.layerId}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={layerState[layer.layerId] ?? layer.defaultEnabled}
                          onChange={(e) => handleLayerToggle(layer.layerId, e.target.checked)}
                          className="w-4 h-4 rounded border-foreground/30 accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span
                          style={{ fontSize: 'var(--text-label)' }}
                          className="text-foreground flex-1 min-w-0 truncate"
                        >
                          {layer.layerName}
                        </span>
                        <span
                          className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-muted-foreground"
                          style={{
                            fontSize: 'var(--text-micro)',
                            background: 'var(--muted)',
                          }}
                        >
                          {LAYER_TYPE_LABELS[layer.layerType]}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RadarLayerPanel;
