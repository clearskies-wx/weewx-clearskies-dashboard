// basemap.ts — the ONE place that knows the Clear Skies product basemap
// (M1 CS-BASEMAP / M3 RADAR-REBASE, DASHBOARD-MANUAL §12 map-layer contract).
//
// Replaces the former CARTO tile sources (dark_all base + light_only_labels
// / voyager_only_labels overlays) and the standalone ADR-078 vector-tile
// outline overlay with one Protomaps-based basemap family, served by the
// API's `/api/v1/basemap/*`
// endpoints from a Protomaps extract the API derives from Clear Skies' own
// configuration (station + earthquake radius + marine locations for the
// world/local tiers; the radar provider's declared coverage box — never any
// other provider field — for the radar tier). Light theme is unaffected
// (OSM raster stays, see LocationMap.tsx / seismic.tsx TILE_CONFIG).
//
// Three tiers (plan §M1 "Lead mechanics — API side"):
//   world  z0–6  — global fallback ground for any pan outside the detail box
//   local  z7–15 — the union(seismic box, marine box) detail tier
//   radar  z0–12 — the radar provider's declared coverage box (Q8/directive 14),
//                  or the station box when the provider declares none
//
// Three <ProtomapsLayer> render modes (plan §M1 "Lead mechanics — dashboard
// side"):
//   dark-base          — dark theme base fill (water/land/boundaries/roads),
//                         paired with its own dark labels (self-contained,
//                         like a raster basemap style with labels baked in)
//   labels             — labels-only overlay (places/water only — no road
//                         shields, no POIs), styled per the CURRENT theme;
//                         stacks on top of dark-base for EXTRA label
//                         emphasis in both themes — the same pattern the
//                         CARTO dark_all + light_only_labels pair used
//                         before this round (LocationMap.tsx T4.2/FIX-8)
//   satellite-outlines — the four ADR-078 line-only rules + dark labels,
//                         drawn above satellite imagery on the radar page

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import {
  leafletLayer,
  paintRules,
  labelRules,
  LineSymbolizer,
  exp,
} from 'protomaps-leaflet';
import type { PaintRule, LabelRule, LeafletLayerOptions } from 'protomaps-leaflet';
import { namedFlavor } from '@protomaps/basemaps';
import type { Flavor } from '@protomaps/basemaps';
import { PMTiles } from 'pmtiles';
import { useApiQuery } from '../hooks/useApiQuery';
import { fetchApi } from '../api/client';
import { PROTOMAPS_OSM_ATTRIBUTION } from './map-attribution';
import type { ResolvedTheme } from './theme-provider';

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export type BasemapTier = 'world' | 'local' | 'radar';

/**
 * Mirrors `client.ts`'s own `API_BASE_URL` default-resolution (not imported —
 * that constant isn't exported, and this file is on a different allowlist
 * item than client.ts). Same env var, same default.
 */
function basemapApiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
}

/** Tile URL + native zoom range per tier (plan §M1: world z0–6, local z7–15,
 *  radar z0–12 — the radar's own provider zoom range, Q8). */
export const BASEMAP_TIERS: Record<BasemapTier, { url: string; minZoom: number; maxZoom: number }> = {
  world: { url: `${basemapApiBase()}/basemap/world/tiles`, minZoom: 0, maxZoom: 6 },
  local: { url: `${basemapApiBase()}/basemap/local/tiles`, minZoom: 7, maxZoom: 15 },
  radar: { url: `${basemapApiBase()}/basemap/radar/tiles`, minZoom: 0, maxZoom: 12 },
};

// ---------------------------------------------------------------------------
// Status — GET /api/v1/basemap/status
// ---------------------------------------------------------------------------

export interface BasemapTierStatus {
  available: boolean;
  size_bytes: number;
  updated_at: string;
  bounds: string;
  minzoom: number;
  maxzoom: number;
}

/** Raw status shape as served (API §M1 "Lead mechanics — API side": per-tier
 *  `{available, size_bytes, updated_at, bounds, minzoom, maxzoom}` plus
 *  `updating`/`last_error`/`last_started_at`/`last_finished_at`). Not an
 *  `ApiResponse<T>` envelope — this endpoint serves the status object bare,
 *  same as the ADR-078 predecessor's status endpoint did. */
export interface BasemapStatus {
  updating: boolean;
  last_error: string | null;
  last_started_at: string;
  last_finished_at: string;
  tiers: Record<BasemapTier, BasemapTierStatus>;
}

/** `GET /api/v1/basemap/status` through the existing `useApiQuery`/`fetchApi`
 *  layer (no hand-written fetch calls, per rules/coding.md). */
export function useBasemapStatus() {
  return useApiQuery<BasemapStatus>((signal) => fetchApi<BasemapStatus>('/basemap/status', undefined, signal));
}

// ---------------------------------------------------------------------------
// Dark base paint rules — the flavor's own rules, buildings/landuse/pois
// dropped (the "current sparse look"), roads replaced with exactly two rules
// (freeways + a dimmer second tier) so freeways are visible from z7 instead
// of the flavor's own much-higher road min-zooms.
// ---------------------------------------------------------------------------

const DARK_FLAVOR: Flavor = namedFlavor('dark');

/**
 * Freeways — Protomaps v4 `roads` dataLayer, `kind === 'highway'` (motorway +
 * trunk). Verified against the installed package, not memory: the `roads`
 * layer's `kind` values are `highway`/`major_road`/`medium_road`/
 * `minor_road`/`other`/`path`/`rail`
 * (docs/reference/pmtiles-protomaps-reference.md §"Protomaps basemap layer
 * names"; node_modules/protomaps-leaflet/src/default_style/style.ts:398).
 * Drawn at every zoom of the local tier (from z7) so the interstate network
 * shows at the seismic page's initial zoom, not just at street zooms —
 * overrides the flavor's own much-higher default road minzoom.
 */
const FREEWAY_RULE: PaintRule = {
  dataLayer: 'roads',
  symbolizer: new LineSymbolizer({
    color: DARK_FLAVOR.highway,
    width: exp(1.6, [
      [7, 0.6],
      [10, 1.2],
      [13, 2.5],
      [15, 4],
    ]),
  }),
  minzoom: 7,
  filter: (_zoom: number, feature: { props: Record<string, unknown> }) => feature.props['kind'] === 'highway',
};

/**
 * Second road tier, one step dimmer than freeways, from z11. The plan's
 * design block named this filter `kind_detail === 'primary'` — VERIFIED
 * against the installed package
 * (node_modules/@protomaps/basemaps/src/base_layers.ts,
 * node_modules/protomaps-leaflet/src/default_style/style.ts in full): the
 * literal string "primary" does not exist anywhere as a `kind` or
 * `kind_detail` value in this schema version, so that filter would never
 * match. The schema's actual second road tier is `kind === 'major_road'` —
 * confirmed correct against the plan's own colour instruction ("same colour
 * family one step dimmer"): `DARK.major` is `#3d3d3d` vs `DARK.highway`
 * `#474747` (node_modules/@protomaps/basemaps/src/flavors.ts:261,263).
 * Coordinator-approved 2026-08-27 (M1-DASH round) — plan text corrected to
 * match.
 */
const PRIMARY_ROAD_RULE: PaintRule = {
  dataLayer: 'roads',
  symbolizer: new LineSymbolizer({
    color: DARK_FLAVOR.major,
    width: exp(1.6, [
      [11, 0.8],
      [15, 2.5],
    ]),
  }),
  minzoom: 11,
  filter: (_zoom: number, feature: { props: Record<string, unknown> }) => feature.props['kind'] === 'major_road',
};

const DARK_BASE_DROPPED_LAYERS = new Set(['buildings', 'landuse', 'pois', 'roads']);

/** Dark base fill: `paintRules(namedFlavor('dark'))` with `buildings`,
 *  `landuse` and `pois` dropped and the flavor's own `roads` rules replaced
 *  by exactly two (FREEWAY_RULE, PRIMARY_ROAD_RULE). Required content per
 *  the plan (operator, 2026-08-27): water, land/coastline, admin boundaries,
 *  freeways — everything else in the flavor's default paint rules (earth
 *  fill, the flavor's own subtle landcover tint when defined, water,
 *  boundaries) stays. */
export function darkBasePaintRules(): PaintRule[] {
  const flavorRules = paintRules(DARK_FLAVOR).filter((rule) => !DARK_BASE_DROPPED_LAYERS.has(rule.dataLayer));
  return [...flavorRules, FREEWAY_RULE, PRIMARY_ROAD_RULE];
}

// ---------------------------------------------------------------------------
// Labels-only rules — places + water only (no road shields, no POIs).
// ---------------------------------------------------------------------------

/** `labelRules(namedFlavor(theme), 'en')` filtered to the `places` and
 *  `water` label rules only (verified against the installed package's own
 *  `labelRules()` — its only three dataLayers are `roads`, `water`,
 *  `places`; dropping `roads` leaves exactly places+water, no POIs exist in
 *  this version's label rules at all). */
export function labelRulesFor(theme: 'light' | 'dark'): LabelRule[] {
  const flavor = namedFlavor(theme);
  return labelRules(flavor, 'en').filter((rule) => rule.dataLayer === 'places' || rule.dataLayer === 'water');
}

// ---------------------------------------------------------------------------
// Satellite outlines — the four ADR-078 rules, moved verbatim from
// radar-map.tsx (formerly GEO_FEATURES_PAINT_RULES / GeoFeaturesLayer).
// ---------------------------------------------------------------------------

export const SATELLITE_OUTLINE_PAINT_RULES: PaintRule[] = [
  {
    dataLayer: 'earth',
    symbolizer: new LineSymbolizer({
      color: '#ffffff',
      width: 1.5,
      opacity: 0.7,
    }),
  },
  {
    dataLayer: 'boundaries',
    symbolizer: new LineSymbolizer({
      color: '#ffffff',
      width: 1.5,
      opacity: 0.7,
    }),
  },
  {
    dataLayer: 'roads',
    symbolizer: new LineSymbolizer({
      color: '#999999',
      width: 1,
      opacity: 0.5,
    }),
    filter: (_zoom: number, feature: { props: Record<string, unknown> }) => {
      const kind = feature.props['kind'];
      return kind === 'highway' || kind === 'major_road';
    },
  },
  {
    dataLayer: 'water',
    symbolizer: new LineSymbolizer({
      color: '#4a90d9',
      width: 1,
      opacity: 0.6,
    }),
    filter: (_zoom: number, feature: { props: Record<string, unknown> }) => feature.props['kind'] !== 'ocean',
  },
];

// ---------------------------------------------------------------------------
// <ProtomapsLayer /> — imperative react-leaflet component, on the former
// GeoFeaturesLayer pattern (radar-map.tsx). Renders nothing (no DOM, no
// Leaflet layer added) until useBasemapStatus() confirms the tier is
// available — mirrors GeoFeaturesLayer's own "no error, no console warning,
// just doesn't render" behavior for a not-yet-extracted PMTiles file.
// ---------------------------------------------------------------------------

export type ProtomapsLayerMode = 'dark-base' | 'labels' | 'satellite-outlines';

export interface ProtomapsLayerProps {
  tier: BasemapTier;
  mode: ProtomapsLayerMode;
  /** Used only by mode 'labels' (picks light vs dark label styling). Ignored
   *  for 'dark-base'/'satellite-outlines'. */
  theme?: ResolvedTheme;
  pane?: string;
  zIndex?: number;
  /**
   * Zoom window this instance's rules draw within — e.g. the world tier's
   * labels pass `maxZoom={6}` so it stops drawing text past z6 once the
   * local tier's own labels take over (never two label layers visible at
   * one zoom, trap #3). Applied to each PAINT/LABEL RULE's own `minzoom`/
   * `maxzoom` (`withZoomWindow`), NOT to the underlying Leaflet GridLayer's
   * `minZoom`/`maxZoom` options — the latter would register this layer in
   * the map's `_zoomBoundLayers` and let Leaflet silently override the
   * user's/`fitBounds()`'s current zoom (verified live regression: a single
   * `maxZoom={6}` GridLayer option clamped the whole marine map to zoom 6
   * regardless of its computed `fitBounds` zoom 12).
   */
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Intersects every rule's own `minzoom`/`maxzoom` (if any) with a tier-wide
 * window, returning NEW rule objects (never mutates the shared arrays
 * `darkBasePaintRules()`/`labelRulesFor()` return, which are recomputed
 * per-render but structurally shared by value across callers).
 *
 * Deliberately NOT implemented via the `<ProtomapsLayer minZoom maxZoom>`
 * props being passed straight through to `leafletLayer()`'s own
 * `L.GridLayerOptions.minZoom`/`maxZoom` — Leaflet's `Map._addZoomLimit` /
 * `_updateZoomLevels` (node_modules/leaflet/dist/leaflet-src.js:7012–7055)
 * aggregates EVERY added layer's explicit `maxZoom` via `Math.max(...)` (the
 * MOST PERMISSIVE wins) and forcibly calls `map.setZoom()` whenever the
 * CURRENT zoom exceeds that aggregate — so a world-tier layer alone
 * declaring `maxZoom={6}` clamped the ENTIRE map to zoom 6 the instant it
 * mounted, discarding whatever `fitBounds()` had just computed (verified
 * live: `fitBounds` correctly computed zoom 12 for the marine map's 2-point
 * bbox, then Leaflet's own `_updateZoomLevels` forced it back down to 6).
 * Rule-level `minzoom`/`maxzoom` (evaluated inside `paint()`/the labeler,
 * `node_modules/protomaps-leaflet/src/painter.ts`) has no such aggregation —
 * it only ever governs the rules within THIS ONE layer's own canvas draw.
 */
function withZoomWindow<T extends { minzoom?: number; maxzoom?: number }>(
  rules: T[],
  minZoom: number | undefined,
  maxZoom: number | undefined,
): T[] {
  if (minZoom === undefined && maxZoom === undefined) return rules;
  return rules.map((rule) => ({
    ...rule,
    ...(minZoom !== undefined ? { minzoom: Math.max(rule.minzoom ?? -Infinity, minZoom) } : {}),
    ...(maxZoom !== undefined ? { maxzoom: Math.min(rule.maxzoom ?? Infinity, maxZoom) } : {}),
  }));
}

export function ProtomapsLayer({ tier, mode, theme, pane, zIndex, minZoom, maxZoom }: ProtomapsLayerProps) {
  const map = useMap();
  const { data: status } = useBasemapStatus();
  const available = status?.tiers[tier]?.available === true;

  useEffect(() => {
    if (!available) return;

    // dark-base and satellite-outlines each draw their own dark labels
    // directly (self-contained, matching a raster basemap style that has
    // labels baked in); the separate `labels` mode additionally stacks a
    // dedicated labels-only overlay on top in both themes, on the marine/
    // seismic maps — the SAME "extra label emphasis over an already-labeled
    // base" pattern the CARTO dark_all + light_only_labels pair used before
    // this round (T4.2/FIX-8 file header). Trap #3 ("never two label layers
    // at one zoom") governs the WORLD-vs-LOCAL boundary WITHIN one mode
    // (world maxZoom=6 / local minZoom=7), not dark-base vs labels-mode.
    const paint: PaintRule[] = withZoomWindow(
      mode === 'dark-base' ? darkBasePaintRules() : mode === 'satellite-outlines' ? SATELLITE_OUTLINE_PAINT_RULES : [],
      minZoom,
      maxZoom,
    );
    const labels: LabelRule[] = withZoomWindow(
      mode === 'labels' ? labelRulesFor(theme ?? 'dark') : labelRulesFor('dark'),
      minZoom,
      maxZoom,
    );

    // Options built without `undefined` keys for `pane`/`zIndex` —
    // L.Util.extend/setOptions merges every OWN property of this object
    // over Leaflet's GridLayer defaults, so an explicit `{ pane: undefined }`
    // would clobber the default rather than being ignored. `minZoom`/
    // `maxZoom` are deliberately NEVER passed here — see `withZoomWindow`.
    const options: LeafletLayerOptions = {
      // PMTiles v4 from our dependency vs v3 bundled in protomaps-leaflet —
      // runtime-compatible but types diverge. Cast to satisfy both (existing
      // accepted pattern — formerly GeoFeaturesLayer, radar-map.tsx).
      url: new PMTiles(BASEMAP_TIERS[tier].url) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      paintRules: paint,
      labelRules: labels,
      attribution: PROTOMAPS_OSM_ATTRIBUTION,
      maxDataZoom: BASEMAP_TIERS[tier].maxZoom,
      ...(pane !== undefined ? { pane } : {}),
      ...(zIndex !== undefined ? { zIndex } : {}),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer: any = leafletLayer(options);
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, available, tier, mode, theme, pane, zIndex, minZoom, maxZoom]);

  return null;
}
