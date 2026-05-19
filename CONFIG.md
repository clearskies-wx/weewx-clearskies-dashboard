# Configuration — weewx-clearskies-dashboard

## Overview

The dashboard itself has no configuration file. It is a static SPA — there are no server-side settings to edit and no rebuild is needed to change branding.

Operator branding (accent color, logo, theme default) will be served by clearskies-api at a `/branding` endpoint and applied in the browser at startup — no dashboard rebuild needed. In v0.1, the dashboard uses built-in defaults (blue palette, OS preference theme mode). The API endpoint and setup wizard integration are planned for a future release.

Initial configuration will be done through the setup wizard in [weewx-clearskies-stack](https://github.com/inguy24/weewx-clearskies-stack). The sections below document the full configuration surface for reference; options marked as defaults are what v0.1 ships with.

---

## Accent color

Six curated accent palettes are available. Each palette is verified WCAG AA compliant (≥4.5:1 contrast) for both light and dark themes. A free-form color picker is not offered — choosing an arbitrary color risks producing inaccessible contrast ratios.

| Palette | Light value | Dark value |
|---|---|---|
| `blue` | `oklch(0.48 0.22 260)` | `oklch(0.70 0.15 260)` |
| `teal` | `oklch(0.46 0.10 185)` | `oklch(0.72 0.09 185)` |
| `indigo` | `oklch(0.42 0.22 280)` | `oklch(0.68 0.15 280)` |
| `purple` | `oklch(0.45 0.20 305)` | `oklch(0.70 0.14 305)` |
| `green` | `oklch(0.46 0.14 150)` | `oklch(0.72 0.12 150)` |
| `amber` | `oklch(0.50 0.14 75)` | `oklch(0.78 0.12 75)` |

All light values achieve ≥4.5:1 contrast on white (`oklch(1 0 0)`). All dark values achieve ≥4.5:1 on the dark background (`oklch(0.145 0 0)`).

The palette will be configurable through the setup wizard once the `/branding` endpoint is implemented. In v0.1, the default palette is `blue`.

---

## Logo

The branding configuration defines:

- `branding.logo.light` — the default logo URL, used in light theme and as the fallback in dark theme
- `branding.logo.dark` — optional separate logo URL for dark theme
- `branding.logo.alt` — alt text for the logo image (required)

**How the logo is selected at runtime:**

- Light theme: `branding.logo.light` is used.
- Dark theme with a dark variant provided: `branding.logo.dark` is used.
- Dark theme without a dark variant: `branding.logo.light` is used with `filter: invert(1)` applied via CSS.

**Warning:** CSS `filter: invert(1)` works acceptably for simple monochrome logos but produces unexpected results for logos with multiple colors or photographic content. If your logo does not invert cleanly, provide a separate dark variant.

**Alt text** is required at upload time. The field must not be left blank.

---

## Theme mode

### Operator default

Controls what new visitors see before they interact with the theme toggle. In v0.1, the default is `auto-os`. Once the setup wizard ships, operators will configure this through the stack repo.

| Value | Behavior |
|---|---|
| `light` | Always light theme for visitors with no stored preference |
| `dark` | Always dark theme for visitors with no stored preference |
| `auto-os` | Follows the visitor's OS preference (`prefers-color-scheme`) |
| `auto-sunrise-sunset` | Intended to switch at local sunrise and sunset times. Currently falls back to OS preference detection — sunrise/sunset switching is planned for a future release. |

### User override

Visitors can cycle through theme states using the theme toggle in the navigation bar. The toggle cycles: system → light → dark → system.

- **system**: respects the operator default (follows OS if operator chose `auto-os` or `auto-sunrise-sunset`; matches a fixed `light` or `dark` if the operator chose one of those)
- **light**: always light, regardless of operator default or OS preference
- **dark**: always dark, regardless of operator default or OS preference

The user's choice is stored in `localStorage` under the key `clearskies.theme.user-override` with values `light`, `dark`, or `system`. It persists across page loads for that browser. Clearing localStorage or opening the site in a private/incognito window resets to the operator default.

**Priority:** user localStorage preference > operator default > OS preference fallback.

---

## Custom CSS

When the `/branding` endpoint is implemented, place a file named `custom.css` in the clearskies-api configuration directory. It will be served by the API and loaded by the dashboard last, after all built-in styles. Rules in `custom.css` will override everything else. This feature is not available in v0.1.

**Stability warning:** CSS variable names used internally by the dashboard are not guaranteed to remain stable across versions. Minor version releases may rename, add, or remove variables. If you use internal CSS variables in `custom.css`, check the changelog before upgrading.

The variables listed in the next section are the officially injected brand variables. These are stable for the v0.x series. All other variables are internal.

---

## CSS variable reference

### Brand-injected variables

`BrandingProvider` sets these four variables on `document.documentElement` at startup based on the configured accent palette:

| Variable | Scope | Value source |
|---|---|---|
| `--brand-primary-light` | Light theme primary color | Palette `light` value |
| `--brand-primary-dark` | Dark theme primary color | Palette `dark` value |
| `--brand-primary-fg-light` | Foreground on primary in light theme | Palette `lightForeground` value |
| `--brand-primary-fg-dark` | Foreground on primary in dark theme | Palette `darkForeground` value |

### Consuming variables

The built-in `index.css` maps the brand variables onto the Tailwind/shadcn semantic tokens via `var()` with fallbacks. These are what the component styles reference:

**Light theme (`:root` or `[data-theme="light"]`):**

| Variable | Expression |
|---|---|
| `--primary` | `var(--brand-primary-light, oklch(0.205 0 0))` |
| `--primary-foreground` | `var(--brand-primary-fg-light, oklch(0.985 0 0))` |
| `--ring` | `var(--brand-primary-light, ...)` |
| `--sidebar-primary` | `var(--brand-primary-light, ...)` |
| `--sidebar-primary-foreground` | `var(--brand-primary-fg-light, ...)` |
| `--sidebar-ring` | `var(--brand-primary-light, ...)` |

**Dark theme (`[data-theme="dark"]`):**

| Variable | Expression |
|---|---|
| `--primary` | `var(--brand-primary-dark, oklch(0.922 0 0))` |
| `--primary-foreground` | `var(--brand-primary-fg-dark, oklch(0.205 0 0))` |
| `--ring` | `var(--brand-primary-dark, ...)` |
| `--sidebar-primary` | `var(--brand-primary-dark, ...)` |
| `--sidebar-primary-foreground` | `var(--brand-primary-fg-dark, ...)` |
| `--sidebar-ring` | `var(--brand-primary-dark, ...)` |

The fallback values are the shadcn/ui defaults and take effect only if the brand variables are not set (for example, if the `/branding` fetch fails before `BrandingProvider` runs).

### localStorage key

| Key | Values | Purpose |
|---|---|---|
| `clearskies.theme.user-override` | `light` \| `dark` \| `system` | Stores the visitor's theme preference across page loads |

---

## Configuration search order (clearskies-api)

The clearskies-api locates its configuration directory in this order:

1. `WEEWX_CLEARSKIES_CONFIG_DIR` environment variable, if set
2. `/etc/weewx-clearskies/<component>.conf`
3. `$XDG_CONFIG_HOME/weewx-clearskies/<component>.conf` (typically `~/.config/weewx-clearskies/`)

This search order applies to clearskies-api, not to the dashboard itself. The dashboard has no local config path — it will receive its configuration from the API at runtime once the `/branding` endpoint ships.
