# Theming and branding — weewx-clearskies-dashboard

This document covers the accent palette system, logo configuration, theme mode behavior, and the internal implementation for contributors.

For operator-facing configuration steps, see [CONFIG.md](../CONFIG.md). For the setup wizard that writes the initial branding configuration, see [weewx-clearskies-stack](https://github.com/inguy24/weewx-clearskies-stack).

---

## Accent palettes

Six palettes are available. All colors are specified in oklch, which provides perceptually uniform hue steps and predictable lightness across palettes.

| Name | Light | Dark | Light fg | Dark fg |
|---|---|---|---|---|
| `blue` | `oklch(0.48 0.22 260)` | `oklch(0.70 0.15 260)` | `oklch(1 0 0)` | `oklch(0.15 0 0)` |
| `teal` | `oklch(0.46 0.10 185)` | `oklch(0.72 0.09 185)` | `oklch(1 0 0)` | `oklch(0.15 0 0)` |
| `indigo` | `oklch(0.42 0.22 280)` | `oklch(0.68 0.15 280)` | `oklch(1 0 0)` | `oklch(0.15 0 0)` |
| `purple` | `oklch(0.45 0.20 305)` | `oklch(0.70 0.14 305)` | `oklch(1 0 0)` | `oklch(0.15 0 0)` |
| `green` | `oklch(0.46 0.14 150)` | `oklch(0.72 0.12 150)` | `oklch(1 0 0)` | `oklch(0.15 0 0)` |
| `amber` | `oklch(0.50 0.14 75)` | `oklch(0.78 0.12 75)` | `oklch(1 0 0)` | `oklch(0.15 0 0)` |

**Foreground colors** are white (`oklch(1 0 0)`) for text and icons on a colored button or badge in light mode, and near-black (`oklch(0.15 0 0)`) in dark mode (where the palette color is lighter).

**WCAG AA compliance:** all light-column values achieve ≥4.5:1 contrast ratio against white (`oklch(1 0 0)`). All dark-column values achieve ≥4.5:1 against the dark surface background (`oklch(0.145 0 0)`). No free-form color picker is offered — it would allow operators to choose colors that break these guarantees.

---

## Logo setup

### Fields

The `/branding` API endpoint accepts:

- `logo.light` — URL to the default logo (used in light theme and as the dark fallback)
- `logo.dark` — URL to an optional separate logo for dark theme
- `logo.alt` — accessible alt text (required; must not be empty)

### Resolution at runtime

The dashboard selects which logo URL to render based on the current resolved theme:

| Resolved theme | `logo.dark` provided? | Logo used | Note |
|---|---|---|---|
| `light` | either | `logo.light` | Normal case |
| `dark` | yes | `logo.dark` | Preferred dark variant |
| `dark` | no | `logo.light` | Falls back to CSS invert |

### CSS invert fallback

When the resolved theme is dark and no `logo.dark` URL is provided, the dashboard applies `filter: invert(1)` to the light logo. This works well for simple white or black monochrome logos and poorly for:

- Logos with multiple colors (hues shift in unpredictable ways)
- Logos containing photographs or gradients
- Logos that use transparency for decorative effect

If your logo does not invert cleanly, upload a separate dark variant. The CSS fallback is intentional for the common case of a single-color wordmark, not a general-purpose solution.

### Alt text

The `logo.alt` field is required and must describe the logo for visitors using screen readers. Example: `"Sunset Ridge Weather Station"`. An empty string is not accepted.

---

## Light/dark mode

### User-facing states

The theme toggle in the navigation bar cycles through three states:

| State | What the visitor sees |
|---|---|
| `system` | Follows the operator default (which may itself follow OS preference) |
| `light` | Always light, regardless of OS or operator setting |
| `dark` | Always dark, regardless of OS or operator setting |

`system` is the starting state for any visitor without a stored preference.

### Operator default

Set during initial configuration via the setup wizard. Affects all visitors whose state is `system`:

| Operator default | Behavior for visitors in `system` state |
|---|---|
| `light` | Always light |
| `dark` | Always dark |
| `auto-os` | Follows `prefers-color-scheme` media query |
| `auto-sunrise-sunset` | Intended to switch at local sunrise/sunset times. Currently falls back to OS preference detection. Sunrise/sunset switching is planned for a future release. |

### Priority chain

```
User localStorage preference
  → if 'light': light
  → if 'dark': dark
  → if 'system' or absent:
      Operator default
        → 'light': light
        → 'dark': dark
        → 'auto-os' or 'auto-sunrise-sunset':
            window.matchMedia('(prefers-color-scheme: dark)')
```

### Flash prevention

A classic (non-module) inline `<script>` in `index.html` runs synchronously during HTML parsing, before React mounts and before any CSS loads:

```js
(function() {
  var s = localStorage.getItem('clearskies.theme.user-override');
  if (s === 'light' || s === 'dark') {
    document.documentElement.setAttribute('data-theme', s);
    return;
  }
  var d = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', d);
})();
```

This sets `data-theme` on `<html>` before the first paint. Because the Tailwind/shadcn color tokens are defined under `[data-theme="light"]` and `[data-theme="dark"]` selectors, the correct colors are applied in the very first rendered frame. Without this script, there would be a visible flash from the default (light) colors to the visitor's actual preference.

The script is intentionally simple and does not attempt to read the operator default — that requires an API fetch. Visitors in `system` mode fall back to OS preference for the initial paint; React reconciles the full priority chain once it mounts and the `/branding` response arrives.

---

## For developers: how the providers work internally

### BrandingProvider (`src/lib/branding-provider.tsx`)

`BrandingProvider` wraps the application and makes the active `BrandingConfig` available via the `useBranding()` hook. On mount (and whenever the accent palette changes), it writes four CSS custom properties to `document.documentElement`:

```ts
root.style.setProperty('--brand-primary-light', palette.light);
root.style.setProperty('--brand-primary-dark', palette.dark);
root.style.setProperty('--brand-primary-fg-light', palette.lightForeground);
root.style.setProperty('--brand-primary-fg-dark', palette.darkForeground);
```

These are written unconditionally to the `:root` element. The CSS layer then uses `var(--brand-primary-light)` inside the `:root` selector and `var(--brand-primary-dark)` inside `[data-theme="dark"]`, so the right value is active depending on the `data-theme` attribute.

The context value is memoized with `useMemo` to avoid creating a new object reference on every render. Without memoization, every `BrandingProvider` re-render (triggered by any ancestor state change) would create a new context value, causing all `useBranding()` consumers to re-render — which can close an infinite loop when any consumer has a `useEffect` that writes state.

In v0.1, `BrandingProvider` uses hardcoded defaults. Fetching from the clearskies-api `/branding` endpoint is planned for a future release.

### ThemeProvider (`src/lib/theme-provider.tsx`)

`ThemeProvider` reads the operator default from `BrandingContext` (via `useContext`) and the user's stored preference from `localStorage`. It exposes three values via `useTheme()`:

- `preference` — the stored value (`light | dark | system`)
- `resolved` — the computed value after applying the priority chain (`light | dark`)
- `setTheme(t)` — writes `preference` to state and localStorage

On every change to `preference` or `operatorDefault`, a `useEffect` calls `document.documentElement.setAttribute('data-theme', newResolved)`. This is the single write point for the active theme on the DOM; all CSS responds to the `data-theme` attribute.

When `preference` is `system` and `operatorDefault` is `auto-os` or `auto-sunrise-sunset`, a second `useEffect` subscribes to `window.matchMedia('(prefers-color-scheme: dark)')` and updates `resolved` on OS-level changes without requiring the user to reload.

The `setTheme` callback is wrapped in `useCallback` and the context value in `useMemo` for the same memoization reason described in the `BrandingProvider` section above.

### Palette data (`src/lib/branding.ts`)

The six accent palettes are defined as a `Record<AccentName, AccentPalette>` in `src/lib/branding.ts`. Each palette entry has four string fields: `light`, `dark`, `lightForeground`, `darkForeground`. These are raw oklch strings written directly to CSS custom properties.

The `AccentName` type is a string union of the six palette names. Adding a new palette requires editing this file and adding the name to the union type. There is no palette registry elsewhere — the single source of truth is `branding.ts`.
