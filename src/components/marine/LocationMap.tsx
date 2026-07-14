// LocationMap.tsx — Leaflet map for the Marine Activities page
// (DASHBOARD-MANUAL §12). Two variants:
//   "full" — landing state, full-size interactive map with a numbered pin
//            per configured location.
//   "hero" — selected state, compressed strip centered on the selected
//            location's marker.
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

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
// Side-effect import already runs once globally from src/main.tsx; re-imported
// here defensively so this component has no implicit ordering dependency on
// main.tsx having run first (module evaluation is cached, so this is a no-op
// when main.tsx already imported it).
import '../../lib/leaflet-setup';
import { useTheme } from '../../lib/theme-provider';
import { OSM_ATTRIBUTION, CARTO_OSM_ATTRIBUTION } from '../../lib/map-attribution';
import type { LatLngBoundsExpression } from 'leaflet';
import type { MarineLocationSummary } from '../../api/types';

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
   * "full", 120 for "hero") when omitted.
   */
  height?: number;
  /** Linked hover (T3.6): id of the location currently hovered via its
   *  LocationCard, so the matching pin can scale up. */
  hoveredId?: string | null;
  /** Notifies the parent when a pin is hovered/unhovered so the matching
   *  LocationCard can be highlighted. Called with null on mouseout. */
  onHoverLocation?: (locationId: string | null) => void;
}

// FlyToSelected — re-centers the map on the selected location when it
// changes (e.g. switching locations, or entering hero mode). Must render
// inside MapContainer.
function FlyToSelected({
  locations,
  selectedId,
  zoom,
}: {
  locations: MarineLocationSummary[];
  selectedId: string | null;
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const loc = locations.find((l) => l.locationId === selectedId);
    if (!loc) return;
    map.flyTo([loc.coordinates.lat, loc.coordinates.lon], zoom, { duration: 0.6 });
  }, [selectedId, locations, map, zoom]);
  return null;
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
}: LocationMapProps) {
  const { t } = useTranslation('marine');
  const { resolved: resolvedTheme } = useTheme();
  const baseTile = TILE_CONFIG[resolvedTheme];

  // Always resolve to a concrete bounds box (never undefined) so MapContainer
  // only ever needs the `bounds` prop, not a center/zoom-vs-bounds branch —
  // same approach as the Seismic page's initialBounds (src/routes/seismic.tsx).
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

  const isHero = variant === 'hero';
  const resolvedHeight = height ?? (isHero ? 120 : 400);
  const ariaLabel = isHero ? t('map.selectedAriaLabel') : t('map.ariaLabel');

  return (
    <div
      className="w-full overflow-hidden rounded-xl ring-1 ring-foreground/10"
      style={{ height: `${resolvedHeight}px` }}
      role="region"
      aria-label={ariaLabel}
    >
      <MapContainer
        bounds={bounds}
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

        {locations.map((loc, i) => {
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

        <FlyToSelected locations={locations} selectedId={selectedId} zoom={isHero ? 10 : 9} />
      </MapContainer>
    </div>
  );
}
