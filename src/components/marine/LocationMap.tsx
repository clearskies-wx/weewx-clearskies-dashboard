// LocationMap.tsx — Leaflet map for the Marine Activities page
// (DASHBOARD-MANUAL §12). Two variants:
//   "full" — landing state, full-size interactive map with a numbered pin
//            per configured location.
//   "hero" — selected state (Phase 5 T5.2/T5.4 combo card), centered and
//            zoomed on the selected location only — not a bounds-fit of
//            every configured location. Renders only the selected marker.
//
// Markers are numbered L.divIcon pins (T3.5) rather than Leaflet's default
// pin or the CircleMarker dots used on the Seismic page — each pin's number
// matches the corresponding LocationCard's number badge so the two views
// stay visually linked. Locations with active alerts get an amber pin
// instead of the operator-accent (var(--primary)) pin — paired with the
// same text/icon alert badge on LocationCard, so color is never the only
// signal (rules/coding.md §5.1).
//
// Linked hover (T3.6): hovering a pin highlights the matching LocationCard
// (via onHoverLocation → parent state → LocationCard's isHovered prop);
// hovering a LocationCard scales up the matching pin 1.3× (via the
// hoveredId prop feeding back into the pin's icon here).
//
// Keyboard access: as with the Seismic page's map (src/routes/seismic.tsx),
// Leaflet markers are a supplementary visual affordance — the primary
// keyboard-reachable interaction is the LocationCard grid (real <button>
// elements) rendered alongside the map, not the map markers themselves.
//
// Marine feature label overlay (T4.2, DASHBOARD-MANUAL §12 / FIX-8; M1
// CS-BASEMAP 2026-08-27): a two-tier `ProtomapsLayer mode="labels"` pair
// (world z0–6 / local z7–15, src/lib/basemap.ts) renders clean geographic
// name labels (place names, water body names) sourced from the Clear Skies
// product basemap — above the base layer, on both themes and both variants.
// Formerly CARTO's `light_only_labels` tile overlay; CARTO is retired
// (M1 CS-BASEMAP). No opacity dimming — the labels-only rule set has no
// fills/lines by design, so darkening it would just make the text harder
// to read.
//
// Dark theme base (M1 CS-BASEMAP): a two-tier `ProtomapsLayer
// mode="dark-base"` pair (world under local) replaces the former CARTO
// `dark_all` tile source. Light theme keeps the OSM raster base unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { CaretLeft } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';
// Side-effect import already runs once globally from src/main.tsx; re-imported
// here defensively so this component has no implicit ordering dependency on
// main.tsx having run first (module evaluation is cached, so this is a no-op
// when main.tsx already imported it).
import '../../lib/leaflet-setup';
import { useTheme } from '../../lib/theme-provider';
import { OSM_ATTRIBUTION } from '../../lib/map-attribution';
import { ProtomapsLayer, useBasemapStatus } from '../../lib/basemap';
import type { LatLngBoundsExpression, TileLayer as LeafletTileLayer } from 'leaflet';
import type { MarineLocationSummary } from '../../api/types';

/** Hero variant (T5.2): fixed zoom on the selected location — coastal
 *  features (pier, harbor entrance, breakwater) are visible at this level. */
const HERO_ZOOM = 14;

// Light-theme basemap tile configuration (OSM raster, unchanged by M1
// CS-BASEMAP). Dark theme renders the Clear Skies product basemap instead
// (ProtomapsLayer mode="dark-base", src/lib/basemap.ts) — see the render
// below.
const TILE_CONFIG = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
  },
} as const;

const PIN_BASE_SIZE = 24;
const PIN_HOVER_SCALE = 1.3;

// Tile-error handling (M1, DASHBOARD-MANUAL §12 map layer contract, fixit
// Item 6): a failed base-tile server previously produced silent gray — no
// error handling, no retry, no visible signal. These three constants are
// fixed by MARINE-PAGE-FIXIT-PLAN-2026-08-10 §Named constants and are not
// re-derivable.
const TILE_ERROR_BANNER_THRESHOLD = 3; // consecutive tileerror events on a layer before the banner shows
const TILE_ERROR_RETRY_BACKOFF_MS = 5000;
const TILE_ERROR_MAX_RETRIES_PER_MOUNT = 3;

/**
 * Tracks consecutive `tileerror` events on a single TileLayer and drives its
 * retry-with-backoff behavior (M1). On reaching `TILE_ERROR_BANNER_THRESHOLD`
 * consecutive errors, `showBanner` becomes true and a redraw of the layer is
 * scheduled `TILE_ERROR_RETRY_BACKOFF_MS` later (up to
 * `TILE_ERROR_MAX_RETRIES_PER_MOUNT` times for this mount). Any successful
 * `tileload` resets the consecutive-error count and clears the banner
 * immediately. State is per-mount by construction — a full remount (e.g. the
 * M2 theme-keyed MapContainer) creates a fresh hook instance with a fresh
 * counter, not a manual reset.
 */
function useTileErrorRecovery(layerRef: RefObject<LeafletTileLayer | null>) {
  const consecutiveErrorsRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(
    () => () => {
      if (retryTimeoutRef.current !== undefined) {
        clearTimeout(retryTimeoutRef.current);
      }
    },
    [],
  );

  const handleTileError = useCallback(() => {
    consecutiveErrorsRef.current += 1;
    if (consecutiveErrorsRef.current < TILE_ERROR_BANNER_THRESHOLD) {
      return;
    }
    setShowBanner(true);
    if (retryCountRef.current >= TILE_ERROR_MAX_RETRIES_PER_MOUNT) {
      return;
    }
    retryCountRef.current += 1;
    if (retryTimeoutRef.current !== undefined) {
      clearTimeout(retryTimeoutRef.current);
    }
    retryTimeoutRef.current = setTimeout(() => {
      layerRef.current?.redraw();
    }, TILE_ERROR_RETRY_BACKOFF_MS);
  }, [layerRef]);

  const handleTileLoad = useCallback(() => {
    consecutiveErrorsRef.current = 0;
    setShowBanner(false);
  }, []);

  return { showBanner, handleTileError, handleTileLoad };
}

/**
 * Builds a numbered divIcon pin (T3.5): 24×24px circle, operator-accent
 * background (var(--primary)) or amber (#f59e0b) for locations with active
 * alerts, white centered number (12px, weight 600). Scales to 1.3× when
 * hovered (T3.6, via the hoveredId prop on LocationMap). Built fresh per
 * marker/render since the number, alert state, and hover state all vary —
 * unlike the previous static module-scope icons, this can't be memoized at
 * module scope.
 */
function buildNumberedIcon(number: number, hasAlerts: boolean, isHovered: boolean): L.DivIcon {
  const size = isHovered ? Math.round(PIN_BASE_SIZE * PIN_HOVER_SCALE) : PIN_BASE_SIZE;
  const bg = hasAlerts ? '#f59e0b' : 'var(--primary)';
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.4);transition:width 0.15s ease,height 0.15s ease;">${number}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

interface LocationMapProps {
  locations: MarineLocationSummary[];
  selectedId: string | null;
  onSelectLocation: (locationId: string) => void;
  variant: 'full' | 'hero';
  /** Fallback center when no locations are configured yet. */
  fallbackCenter?: [number, number];
  /**
   * Explicit pixel height (T3.9 — the responsive landing-state layout
   * computes this from the configured locations' bounding-box aspect
   * ratio). Falls back to the variant's previous fixed height (400 for
   * "full") when omitted. For "hero", omitting this prop uses a responsive
   * CSS height instead (180px mobile / 220px desktop, DASHBOARD-MANUAL §12
   * combo card spec) rather than a single fixed pixel value, since the
   * combo card's map column is a different height per breakpoint.
   */
  height?: number;
  /** Linked hover (T3.6): id of the location currently hovered via its
   *  LocationCard, so the matching pin can scale up. */
  hoveredId?: string | null;
  /** Notifies the parent when a pin is hovered/unhovered so the matching
   *  LocationCard can be highlighted. Called with null on mouseout. */
  onHoverLocation?: (locationId: string | null) => void;
  /**
   * Optional className override merged via `cn()` (tailwind-merge), so a
   * caller can adjust the outer wrapper's rounding when the map sits flush
   * against a sibling element — e.g. the T5.4 combo card squares off the
   * map's right corners (`rounded-r-none`) when a photo occupies the right
   * ~40% of the card, so the seam between map and photo reads as one card
   * edge rather than two independently-rounded rectangles.
   */
  className?: string;
  /**
   * T4.4 (DASHBOARD-MANUAL §12 detail-page fixes): when provided AND
   * variant="hero", renders a "Back to map" button as an overlay control
   * inside the map container (top-left), matching the radar card's own
   * map-overlay-control treatment (bg-background/80 + backdrop-blur-sm,
   * DESIGN-MANUAL §8 Surface Treatment Inventory "Radar controls" row).
   * Replaces the old back button that sat in a flex row above the combo
   * card in marine.tsx.
   */
  onBack?: () => void;
}

export function LocationMap({
  locations,
  selectedId,
  onSelectLocation,
  variant,
  fallbackCenter = [0, 0],
  height,
  hoveredId = null,
  onHoverLocation,
  className,
  onBack,
}: LocationMapProps) {
  const { t } = useTranslation('marine');
  const { resolved: resolvedTheme } = useTheme();
  const baseTile = TILE_CONFIG.light;

  // M1: consecutive-tileerror tracking + retry-with-backoff for the light-
  // theme OSM base layer (unchanged mechanism). Dark theme has no TileLayer
  // to attach this to — the product basemap's own availability (below)
  // covers it instead.
  const baseLayerRef = useRef<LeafletTileLayer | null>(null);
  const baseTileRecovery = useTileErrorRecovery(baseLayerRef);

  // M1 CS-BASEMAP: the world/local ProtomapsLayer tiers back BOTH the dark
  // base and the labels overlay (in both themes) — if either tier isn't
  // extracted yet, show the same non-blocking banner with a distinct
  // message, same as the light-theme tile-error path never leaves silent
  // gray (tiles render, or a banner is visible — never neither).
  // Gate M1-DASH D16 (2026-08-27): a FAILED status request (API down, 502,
  // network) is the same "server unreachable" condition that also kills the
  // tile fetches — it must raise the banner too, not leave `basemapStatus`
  // null and the box silently gray. `Boolean(error)` (not `!== null`) so a
  // stub or hook that omits the field never trips it.
  const { data: basemapStatus, error: basemapStatusError } = useBasemapStatus();
  const basemapUnavailable =
    Boolean(basemapStatusError) ||
    (basemapStatus !== null &&
      (basemapStatus.tiers.world.available === false || basemapStatus.tiers.local.available === false));
  const showTileErrorBanner = baseTileRecovery.showBanner || basemapUnavailable;
  const tileErrorMessage = baseTileRecovery.showBanner ? t('map.tileError') : t('map.basemapUnavailable');

  const isHero = variant === 'hero';
  const showBackButton = isHero && Boolean(onBack);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.locationId === selectedId) ?? null,
    [locations, selectedId],
  );

  // Full-variant bounds box (landing state — fits every configured
  // location). Not used in hero mode, which centers on the selected
  // location only (T5.2) rather than fitting all locations' bounds.
  const bounds: LatLngBoundsExpression = useMemo(() => {
    if (locations.length === 0) {
      const [lat, lon] = fallbackCenter;
      return [[lat - 0.05, lon - 0.05], [lat + 0.05, lon + 0.05]];
    }
    const lats = locations.map((l) => l.coordinates.lat);
    const lons = locations.map((l) => l.coordinates.lon);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ];
  }, [locations, fallbackCenter]);

  const boundsOptions = useMemo(() => ({ padding: [40, 40] as [number, number] }), []);

  // Hero center (T5.2): the selected location's coordinates, falling back
  // to fallbackCenter only for the (non-visible-in-practice) case where
  // hero is rendered without a resolvable selection.
  const heroCenter: [number, number] = selectedLocation
    ? [selectedLocation.coordinates.lat, selectedLocation.coordinates.lon]
    : fallbackCenter;

  // Landing state (T3.9) passes an explicit computed height; hero omits it
  // and uses a responsive CSS height instead (180px mobile / 220px desktop,
  // DASHBOARD-MANUAL §12 combo card spec) since the map column's height
  // differs by breakpoint rather than being a single fixed pixel value.
  const resolvedHeight = height ?? (isHero ? undefined : 400);
  const ariaLabel = isHero ? t('map.selectedAriaLabel') : t('map.ariaLabel');

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl ring-1 ring-foreground/10',
        resolvedHeight === undefined && 'h-[180px] md:h-[220px]',
        className,
      )}
      style={resolvedHeight !== undefined ? { height: `${resolvedHeight}px` } : undefined}
      role="region"
      aria-label={ariaLabel}
    >
      <MapContainer
        // M2 (DASHBOARD-MANUAL §12 map layer contract): keyed on
        // resolvedTheme instead of the per-layer `key={baseTile.url}` that
        // used to live on the base TileLayer alone. A theme flip (including
        // the sunrise/sunset auto-theme's self-correction) now remounts the
        // whole map atomically, so the label layer can never outlive the
        // base layer.
        key={resolvedTheme}
        center={isHero ? heroCenter : undefined}
        zoom={isHero ? HERO_ZOOM : undefined}
        bounds={isHero ? undefined : bounds}
        boundsOptions={isHero ? undefined : boundsOptions}
        className="h-full w-full"
        scrollWheelZoom={!isHero}
        dragging={!isHero}
        zoomControl={!isHero}
        touchZoom={!isHero}
        doubleClickZoom={!isHero}
        boxZoom={!isHero}
        keyboard={!isHero}
      >
        {resolvedTheme === 'light' ? (
          <TileLayer
            ref={baseLayerRef}
            url={baseTile.url}
            attribution={baseTile.attribution}
            eventHandlers={{
              tileerror: baseTileRecovery.handleTileError,
              tileload: baseTileRecovery.handleTileLoad,
            }}
          />
        ) : (
          <>
            {/* Dark theme base (M1 CS-BASEMAP) — world under local, world has
                no maxZoom so its z6 data keeps rendering (overzoomed) as the
                ground beyond the local tier's box. */}
            <ProtomapsLayer tier="world" mode="dark-base" />
            <ProtomapsLayer tier="local" mode="dark-base" minZoom={7} />
          </>
        )}

        {/* Marine feature label overlay (T4.2; M1 CS-BASEMAP) — water body /
            coastal place name labels only, no buoys/channels/depth
            soundings, no road shields, no POIs. Rendered above the basemap
            on both themes and both variants. World labels cap at z6, local
            labels start at z7 — never both at one zoom. */}
        <ProtomapsLayer tier="world" mode="labels" theme={resolvedTheme} maxZoom={6} />
        <ProtomapsLayer tier="local" mode="labels" theme={resolvedTheme} minZoom={7} />

        {/* Hero mode renders only the selected location's marker (T5.2) —
            not every configured location. */}
        {(isHero ? (selectedLocation ? [selectedLocation] : []) : locations).map((loc) => {
          const i = locations.findIndex((l) => l.locationId === loc.locationId);
          const hasAlerts = (loc.activeAlerts?.length ?? 0) > 0;
          const isHovered = hoveredId === loc.locationId;
          return (
            <Marker
              key={loc.locationId}
              position={[loc.coordinates.lat, loc.coordinates.lon]}
              icon={buildNumberedIcon(i + 1, hasAlerts, isHovered)}
              // Leaflet auto-assigns role="button" + tabindex to marker icons
              // when keyboard=true (Marker's own option, independent of the
              // map's keyboard option), but gives them no accessible name —
              // axe-core aria-command-name violation. Markers here are a
              // supplementary visual affordance, not the primary keyboard
              // path (see file header comment); LocationCard's real <button>
              // elements are. Same precedent as the Seismic page, whose
              // CircleMarker layers are not keyboard-focusable either.
              keyboard={false}
              eventHandlers={{
                click: () => onSelectLocation(loc.locationId),
                mouseover: () => onHoverLocation?.(loc.locationId),
                mouseout: () => onHoverLocation?.(null),
              }}
            >
              <Popup>
                <div>
                  <strong>{loc.name}</strong>
                  {hasAlerts && (
                    <>
                      <br />
                      {t('alertCount', { count: loc.activeAlerts?.length ?? 0 })}
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Tile-error banner (M1) — non-blocking overlay, same
          bg-background/80 + backdrop-blur-sm convention as the back-to-map
          button and the radar card's overlay controls below. Does not cover
          the map (silent gray becomes impossible: tiles render, or this is
          visible — never neither), and does not intercept pointer events so
          the map underneath stays interactive while retrying. */}
      {showTileErrorBanner && (
        <div
          role="status"
          aria-live="polite"
          className={[
            'pointer-events-none absolute top-2 right-2 left-2 z-[1000]',
            'mx-auto w-fit max-w-[90%] rounded-md border bg-background/80 px-3 py-2',
            'text-center font-semibold text-foreground backdrop-blur-sm',
          ].join(' ')}
          style={{ fontSize: 'var(--text-label)' }}
        >
          {tileErrorMessage}
        </div>
      )}

      {/* Back-to-map overlay button (T4.4) — lives inside the map container,
          top-left, like the radar card's own overlay controls (RadarLegend /
          loading indicator in src/components/shared/radar-map.tsx use the
          same bg-background/80 + backdrop-blur-sm + z-[1000] convention).
          Rendered as a DOM sibling of MapContainer, not a Leaflet control,
          so it doesn't need react-leaflet's imperative control API. */}
      {showBackButton && (
        <button
          type="button"
          onClick={onBack}
          className={[
            'absolute top-2 left-2 z-[1000] flex items-center gap-1.5',
            'min-h-[44px] rounded-md border bg-background/80 px-3 py-2',
            'font-semibold text-foreground backdrop-blur-sm',
            'hover:bg-background/95 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          ].join(' ')}
          style={{ fontSize: 'var(--text-label)' }}
        >
          <CaretLeft aria-hidden="true" focusable="false" className="size-4" />
          {t('backToMap')}
        </button>
      )}
    </div>
  );
}
