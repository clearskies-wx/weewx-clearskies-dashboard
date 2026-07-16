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
// Marine feature label overlay (T4.2, DASHBOARD-MANUAL §12 / FIX-8): a
// second TileLayer renders CARTO's `light_only_labels` layer — clean
// geographic name labels (water body names, coastal place names) sourced
// from OSM data — above the basemap, on both variants. This replaces the
// prior OpenSeaMap seamark overlay, which showed navigational features
// (buoys, channels, harbor markers, depth contours) that read as clutter
// rather than the "clean marine feature labels" the page wants. No opacity
// dimming — `light_only_labels` is already a transparent label-only layer
// by design, so darkening it would just make the text harder to read.

import { useMemo } from 'react';
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
import { OSM_ATTRIBUTION, CARTO_OSM_ATTRIBUTION } from '../../lib/map-attribution';
import type { LatLngBoundsExpression } from 'leaflet';
import type { MarineLocationSummary } from '../../api/types';

/** CARTO `light_only_labels` — transparent label-only overlay (place/water
 *  names), served over `{s}.basemaps.cartocdn.com`. Same CARTO product
 *  family as the existing dark basemap tiles, so the existing
 *  CARTO_OSM_ATTRIBUTION string covers it — no new attribution string
 *  needed (T4.2). */
const LABEL_OVERLAY_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png';

/** Hero variant (T5.2): fixed zoom on the selected location — coastal
 *  features (pier, harbor entrance, breakwater) are visible at this level. */
const HERO_ZOOM = 14;

// Basemap tile configuration — same OSM/CartoDB pair used by the Seismic
// and Radar pages (src/routes/seismic.tsx, src/components/shared/radar-map.tsx).
const TILE_CONFIG = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_OSM_ATTRIBUTION,
  },
} as const;

const PIN_BASE_SIZE = 24;
const PIN_HOVER_SCALE = 1.3;

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
  const baseTile = TILE_CONFIG[resolvedTheme];

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
      return [[lat - 5, lon - 5], [lat + 5, lon + 5]];
    }
    const lats = locations.map((l) => l.coordinates.lat);
    const lons = locations.map((l) => l.coordinates.lon);
    const pad = 0.15;
    return [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
  }, [locations, fallbackCenter]);

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
        center={isHero ? heroCenter : undefined}
        zoom={isHero ? HERO_ZOOM : undefined}
        bounds={isHero ? undefined : bounds}
        className="h-full w-full"
        scrollWheelZoom={!isHero}
        dragging={!isHero}
        zoomControl={!isHero}
        touchZoom={!isHero}
        doubleClickZoom={!isHero}
        boxZoom={!isHero}
        keyboard={!isHero}
      >
        <TileLayer key={baseTile.url} url={baseTile.url} attribution={baseTile.attribution} />

        {/* Marine feature label overlay (T4.2) — water body / coastal place
            name labels only, no buoys/channels/depth soundings. Rendered
            above the basemap on both variants. */}
        <TileLayer url={LABEL_OVERLAY_URL} attribution={CARTO_OSM_ATTRIBUTION} />

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
