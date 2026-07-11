// LocationMap.tsx — Leaflet map for the Marine Activities page
// (DASHBOARD-MANUAL §12). Two variants:
//   "full" — landing state, full-size interactive map with a marker per
//            configured location.
//   "hero" — selected state, compressed ~120px strip centered on the
//            selected location's marker.
//
// Markers use Leaflet's default pin icon (via leaflet-setup.ts) rather than
// the CircleMarker dots used on the Seismic page, so marine markers are
// visually distinct from earthquake markers per the T7.1 spec. Locations
// with active alerts get a colored pin (amber) instead of the default blue
// pin — paired with the same text/icon alert badge on LocationCard below,
// so color is never the only signal (rules/coding.md §5.1).
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

// Amber alert marker — same visual language as the amber alert badge on
// LocationCard. Built once at module scope (Leaflet icons are immutable).
const alertIcon = L.divIcon({
  className: '',
  html: '<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f59e0b;border:2px solid #78350f;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 20],
  popupAnchor: [0, -20],
});

// Explicit default-blue-pin icon for locations without an active alert.
// react-leaflet's <Marker icon={...}> passes `icon: undefined` straight
// through to the underlying L.Marker options when the prop is explicitly
// `undefined` — L.extend()'s merge treats an own property with value
// `undefined` as present, so it clobbers L.Marker.prototype.options.icon
// (set by leaflet-setup.ts) instead of falling back to it. That crashes
// Leaflet's _initIcon() with "Cannot read properties of undefined (reading
// 'createIcon')". Always pass a concrete icon — never rely on the prop
// being omitted to mean "use the default."
const defaultIcon = new L.Icon.Default();

interface LocationMapProps {
  locations: MarineLocationSummary[];
  selectedId: string | null;
  onSelectLocation: (locationId: string) => void;
  variant: 'full' | 'hero';
  /** Fallback center when no locations are configured yet. */
  fallbackCenter?: [number, number];
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
  const heightClass = isHero ? 'h-[120px]' : 'h-[400px]';
  const ariaLabel = isHero ? t('map.selectedAriaLabel') : t('map.ariaLabel');

  return (
    <div
      className={`${heightClass} w-full overflow-hidden rounded-xl ring-1 ring-foreground/10`}
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

        {locations.map((loc) => {
          const hasAlerts = (loc.activeAlerts?.length ?? 0) > 0;
          return (
            <Marker
              key={loc.locationId}
              position={[loc.coordinates.lat, loc.coordinates.lon]}
              icon={hasAlerts ? alertIcon : defaultIcon}
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
