# Changelog

All notable changes to weewx-clearskies-dashboard are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Product basemap replaces CARTO (M1 CS-BASEMAP / M3 RADAR-REBASE)** — the
  marine, seismic, and radar/satellite maps' dark theme now renders a
  self-served Protomaps vector basemap (`src/lib/basemap.ts`,
  `ProtomapsLayer`) instead of CARTO's `dark_all`/`light_only_labels`/
  `voyager_only_labels` tiles, which CARTO began watermarking and is
  retiring. Light theme is unchanged (OSM raster). The radar page's
  satellite view now draws boundaries/roads/water outlines + labels from the
  same basemap family (one combined layer) instead of the former
  CARTO-labels overlay plus the separate ADR-078 geographic-features vector
  overlay — the ADR-078 feature is absorbed into this basemap machinery.
  Freeways (motorway + trunk) are visible on the dark basemap from the local
  tier's minimum zoom (z7), not just at street zooms. Attribution changes
  from "OpenStreetMap contributors © CARTO" to "OpenStreetMap contributors
  © Protomaps" on affected maps.

- **Surf height map background replaces Esri/NAIP orthophotography with the
  product basemap (M4 SURF-MAP-BASEMAP, PA9/Q5)** — the Surfing tab's heat
  map background is no longer aerial photography: light theme now shows the
  same OSM raster tiles used elsewhere on the dashboard, dark theme shows a
  PNG rasterized in the browser from the local Protomaps basemap tier
  (`src/lib/basemap.ts` `rasterizeBasemapTile`, `src/hooks/useRasterizedTiles.ts`).
  Mosaic geometry (tile placement, rotation, buffer) is unchanged. The
  About page's imagery-provider attribution row is removed — the product
  basemap's OpenStreetMap/Protomaps attribution is already listed under Base
  Maps.

### Added

- **Custom background image** — when the operator uploads a background photo
  via the setup wizard (`branding.json` → `customBackgroundUrl`), the dashboard
  renders it as the background for every sky condition instead of the 6
  built-in scene-keyed photos. No precipitation overlay or photographer
  attribution applies to a custom background. Falls back to the built-in scene
  system when unset.

### Removed

- **Custom CSS URL loading** — the operator-supplied `custom.css` file-loading
  mechanism (branding `customCssUrl` field, `<link>` injection in `App.tsx`)
  has been eliminated. Brand color customization remains available only
  through the curated accent palette selection (see THEMING.md) — there is
  no longer a mechanism to load an arbitrary external stylesheet.

## [0.1.0] — 2026-05-19

First public release — a modern, mobile-first weather dashboard SPA for weewx.

### Added

- **Nine pages** covering all core weather station data:
  Now, Forecast, Charts, Almanac, Earthquakes, Records, Reports, About, Legal
- **Mobile-first responsive layout** — bottom bar with overflow "More" sheet on
  mobile; icon rail on desktop (768 px breakpoint)
- **Light / dark / auto theme modes** with OS-preference detection and
  flash-prevention blocking script
- **Six curated accent palettes** (blue, teal, indigo, purple, green, amber),
  all WCAG AA compliant in both light and dark modes
- **Operator logo** support with optional separate dark-mode variant
- **Custom CSS escape hatch** via CSS variable overrides
- **Real-time current conditions** via Server-Sent Events from
  weewx-clearskies-realtime
- **API-driven configuration** — all branding/theming served at runtime by
  weewx-clearskies-api; no rebuild needed to change settings
- **Typed API client layer** with React hooks, loading skeletons, and error
  states on every route
- **Historical charts** — homepage summary, average climate, monthly, and annual
  tabs with Recharts
- **NOAA text reports** — monthly and annual, self-hiding when none are available
- **Code-split routing** — each page lazy-loaded for minimal initial bundle
- **Accessibility** — WCAG AA color contrast, ARIA landmarks, keyboard
  navigation, focus management, semantic HTML throughout
- **Documentation** — README, INSTALL, CONFIG, and THEMING guides

### Known limitations

These are tracked for Phase 4 and beyond:

- `/branding` endpoint returns stub data (full branding configuration in Phase 4)
- Auto sunrise/sunset theme switching deferred — `matchMedia` fallback in place,
  needs almanac API data
- `custom.css` link injection not yet implemented (no setup wizard)
- Unit strings hardcoded to imperial ("°F", "inHg", "mph") — unit-system
  awareness in Phase 4
- Weather condition text hardcoded ("Partly Cloudy") — needs real condition data
- Forecast discussion/narrative tile absent (off by default per ADR-024)
- Webcam, timelapse, and radar tabs need real provider wiring
- Yearly report UI path not yet implemented
- `beaufortLabel` assumes mph input

### Build

- Gzipped JS bundle: 96.16 KB (48% of 200 KB budget per ADR-033)
- TypeScript: clean, zero errors
- Framework: React 19 + Vite 8 + Tailwind CSS v4 + shadcn/ui + Recharts 3

[0.1.0]: https://github.com/inguy24/weewx-clearskies-dashboard/releases/tag/v0.1.0
