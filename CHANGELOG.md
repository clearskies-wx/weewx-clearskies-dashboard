# Changelog

All notable changes to weewx-clearskies-dashboard are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
