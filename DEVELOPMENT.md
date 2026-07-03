# Development — weewx-clearskies-dashboard

This document covers setting up a local development environment, running the dev server, tests, and contributing changes.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | [nodejs.org](https://nodejs.org/) or `nvm` |
| npm | 10+ | Bundled with Node 22 |
| weewx-clearskies-api | running on port 8765 | Required for real data; mock mode available without it |

---

## Setup

```bash
git clone https://github.com/inguy24/weewx-clearskies-dashboard.git
cd weewx-clearskies-dashboard
npm install
```

---

## Development server

```bash
npm run dev
```

Starts the Vite dev server at `http://localhost:5173` with hot module replacement (HMR). The `vite.config.ts` proxy forwards all `/api/*` requests to `http://localhost:8765` (clearskies-api) and `/sse` to `http://localhost:8766` (clearskies-realtime).

### Mock data mode

To run the dashboard without a live clearskies-api, set `VITE_USE_MOCK=true`:

```bash
VITE_USE_MOCK=true npm run dev
```

The mock data layer in `src/api/mock.ts` provides synthetic responses for all API endpoints.

---

## Production build

```bash
npm run build
```

Runs `tsc -b` (TypeScript type check) followed by the Vite production build. Output goes to `dist/`. The build fails if TypeScript reports errors.

```bash
npm run preview   # serve dist/ locally at http://localhost:4173
```

---

## Linting and type checking

```bash
npm run lint      # ESLint
npx tsc --noEmit  # type check only (no emit)
```

ESLint is configured in `eslint.config.js`. TypeScript is configured in `tsconfig.app.json` and `tsconfig.node.json`.

---

## Tests

```bash
npm test           # Vitest (run once)
npm run test:watch # Vitest (watch mode)
```

Tests use `vitest` + `@testing-library/react` + `jsdom`. Test files are `*.test.ts` / `*.test.tsx` alongside the source files.

Accessibility tests use `axe-playwright` via Playwright. To run the full Playwright suite:

```bash
npx playwright install  # first time only
npx playwright test
```

---

## Path alias

The `@` alias resolves to `./src`:

```ts
import { useBranding } from '@/lib/branding-provider';
import { useTheme } from '@/lib/theme-provider';
```

---

## Code conventions

- TypeScript throughout — no `.js` files in `src/`.
- React 19 functional components + hooks. No class components.
- Tailwind CSS v4 for styling. No inline `style` props on layout/theme concerns — use CSS variables and Tailwind classes.
- shadcn/ui components are copy-pasted into `src/components/ui/` and modified there. They are not runtime dependencies. Do not run `npx shadcn add` without reviewing the output — it may overwrite customized files.
- Route files live in `src/routes/` and correspond to the 9 built-in pages per ADR-024.
- Shared layout components (nav rail, footer, app layout) are in `src/components/layout/`.
- Shared non-layout UI components are in `src/components/shared/`.
- API types are in `src/api/types.ts`; the typed client and hooks are in `src/api/client.ts` and `src/api/useWeatherData.ts`.
- Context providers are in `src/lib/`.

---

## Adding a new dependency

Before adding a package:

1. Check whether the need is already covered by an existing dependency.
2. Verify the license is compatible with PolyForm Noncommercial 1.0.0 (see ADR-081).
3. Run `npm audit` after install and resolve any high-severity findings before committing.

---

## Committing

All commits must be signed off with `-s` per the project's DCO policy (ADR-003):

```bash
git commit -s -m "description of change"
```

This adds a `Signed-off-by:` trailer certifying that the contribution is yours to submit under the project license.

---

## Accessibility

The dashboard targets WCAG 2.1 Level AA. All new UI changes must pass:

1. `axe-playwright` automated scan (zero violations target).
2. Keyboard navigation check.
3. Color contrast check in both light and dark themes.

See `rules/coding.md` §5 for the full accessibility audit checklist (in the meta repo).
