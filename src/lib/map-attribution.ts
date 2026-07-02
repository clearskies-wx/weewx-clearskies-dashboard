// map-attribution.ts — Shared Leaflet basemap attribution strings (T3.0b).
//
// Single source for the OpenStreetMap / CARTO attribution HTML strings used
// by every Leaflet TileLayer across the dashboard (radar map, seismic map).
// Extracted so the same ToS-mandated text isn't hand-copied per call site.

/** OpenStreetMap attribution — standard light-theme OSM tiles. */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** OpenStreetMap + CARTO attribution — CartoDB dark/voyager tile sets. */
export const CARTO_OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** OpenStreetMap ODbL attribution — used for vector overlays sourced from OSM data (e.g. geographic features). */
export const OSM_ODBL_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)';
