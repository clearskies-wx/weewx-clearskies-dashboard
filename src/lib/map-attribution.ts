// map-attribution.ts — Shared Leaflet basemap attribution strings (T3.0b).
//
// Single source for the OpenStreetMap / Protomaps attribution HTML strings
// used by every Leaflet TileLayer / ProtomapsLayer across the dashboard
// (marine map, seismic map, radar map — M1 CS-BASEMAP). Extracted so the
// same ToS-mandated text isn't hand-copied per call site.

/** OpenStreetMap attribution — standard light-theme OSM tiles. */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** OpenStreetMap + Protomaps attribution — the Clear Skies product basemap
 *  (M1 CS-BASEMAP): dark theme base/labels and the radar satellite outlines
 *  layer, all sourced from the same Protomaps extract. Replaces
 *  the former CARTO attribution constant, removed with the CARTO tile
 *  sources it covered. */
export const PROTOMAPS_OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://protomaps.com">Protomaps</a>';

/** OpenSeaMap attribution — marine feature overlay (buoys, channels, harbors, depth contours) on the Marine Activities page map (DASHBOARD-MANUAL §12, T5.3). */
export const OPENSEAMAP_ATTRIBUTION =
  'Map data: &copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors';
