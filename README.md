# weewx-clearskies-dashboard

A modern, mobile-first weather dashboard for [weewx](https://github.com/weewx/weewx). React 19 single-page application that fetches all data from [weewx-clearskies-api](https://github.com/inguy24/weewx-clearskies-api) at runtime and displays it through a clean, accessible UI.

Part of [Clear Skies](https://github.com/inguy24/weewx-clearskies-stack) — a modular, modern weather UI stack for weewx.

Distributed AS-IS under [GPL v3](LICENSE).

---

## Features

Nine built-in pages covering all core weather station data:

| Page | Route | Description |
|---|---|---|
| Now | `/` | Current conditions — always present |
| Forecast | `/forecast` | Multi-day forecast from configured provider |
| Charts | `/charts` | Historical charts: homepage, average climate, monthly, annual |
| Almanac | `/almanac` | Sun/moon data and astronomical events |
| Earthquakes | `/earthquakes` | Recent seismic activity from configured provider |
| Records | `/records` | All-time station records |
| Reports | `/reports` | NOAA monthly/annual text reports (self-hides when none are available) |
| About | `/about` | Station information |
| Legal | `/legal` | Site legal/attribution text |

**Navigation layout:**

- Desktop (768 px and wider): icon rail on the left, 64 px wide
- Mobile (narrower than 768 px): bottom bar with 4 primary items and a "More" sheet for the rest

**Branding and theming:**

- 6 curated accent palettes, all WCAG AA compliant
- Light, dark, and automatic (OS preference) theme modes
- Operator logo with optional separate dark variant
- Custom CSS escape hatch for site-specific overrides

**Technical:**

- Zero server-side rendering — purely static HTML/CSS/JS after build
- Real-time current conditions via Server-Sent Events from [weewx-clearskies-realtime](https://github.com/inguy24/weewx-clearskies-realtime)
- All operator configuration served by the API at runtime — no rebuild needed to change branding

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19, react-router-dom v7 |
| Language | TypeScript 6 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Charts | Recharts 3 |
| Icons | Lucide React |
| Typography | Geist Variable font |

---

## Quick start

See [INSTALL.md](INSTALL.md) for full prerequisites, build steps, and reverse proxy configuration.

```bash
git clone https://github.com/inguy24/weewx-clearskies-dashboard.git
cd weewx-clearskies-dashboard
npm install
npm run dev          # dev server at http://localhost:5173
```

The dev server proxies `/api` requests to `http://localhost:8765` (the clearskies-api default port). Start clearskies-api before running the dashboard in development mode.

For production: `npm run build` outputs a static bundle to `dist/`. Serve the contents of `dist/` with any static file server or reverse proxy.

---

## Configuration

The dashboard has no configuration file of its own. All operator settings — accent color, logo, station name, theme default — are served by the clearskies-api `/branding` endpoint and applied at runtime.

See [CONFIG.md](CONFIG.md) for the full reference, including the accent palette options, logo setup, and CSS variable names.

Initial configuration is done through the setup wizard in the stack repo. See [weewx-clearskies-stack](https://github.com/inguy24/weewx-clearskies-stack).

---

## Theming

See [docs/THEMING.md](docs/THEMING.md) for:

- Accent palette oklch values and WCAG compliance details
- Logo light/dark variant behavior
- Theme mode priority chain and flash-prevention mechanism
- CSS variable reference for custom overrides
- How `BrandingProvider` and `ThemeProvider` work for contributors

---

## Development

```bash
npm run dev       # Vite dev server with HMR at http://localhost:5173
npm run build     # TypeScript check + Vite production build → dist/
npm run lint      # ESLint
npm run preview   # Serve the production build locally
```

The `@` path alias resolves to `./src`:

```ts
import { useBranding } from '@/lib/branding-provider';
import { useTheme } from '@/lib/theme-provider';
```

The Vite dev server proxies `/api/*` to `http://localhost:8765`. In production, the operator's reverse proxy is responsible for this routing. See [INSTALL.md](INSTALL.md) for a reverse proxy configuration example.

For full development environment setup, contribution guidelines, and code conventions, see [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Sibling repositories

| Repo | Role |
|---|---|
| [weewx-clearskies-api](https://github.com/inguy24/weewx-clearskies-api) | REST API — FastAPI + SQLAlchemy, reads weewx archive DB, calls external data providers |
| [weewx-clearskies-realtime](https://github.com/inguy24/weewx-clearskies-realtime) | SSE bridge — publishes weewx loop packets as Server-Sent Events |
| [weewx-clearskies-stack](https://github.com/inguy24/weewx-clearskies-stack) | Docker Compose deployment, setup wizard, architecture diagrams |

---

## License

[GNU General Public License v3.0](LICENSE)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

Distributed AS-IS. See LICENSE for full terms.
