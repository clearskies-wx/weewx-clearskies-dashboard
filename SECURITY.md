# Security — weewx-clearskies-dashboard

This repository is part of [Clear Skies](https://github.com/clearskies-wx/weewx-clearskies-stack), distributed AS-IS under [GPL v3](LICENSE). There is no support window, no LTS, and no security backport policy — only the current release is available.

---

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:

**Security tab → Advisories → "Report a vulnerability"**

Or open a GitHub issue prefixed with `[security]` if private reporting is unavailable.

---

## Trust model

The dashboard is a **static single-page application (SPA)**. After building, it is a directory of HTML, CSS, and JavaScript files. There is no server-side process — no backend code runs in production as part of the dashboard itself.

All weather data is fetched from clearskies-api at runtime over HTTPS (via the reverse proxy). The dashboard has no database access, no file system access, and no secrets of its own.

**Threat surface:**

1. **JavaScript execution in the browser** — the main surface. The build process produces static files; the operator's web server serves them. Operators are responsible for securing the web server.
2. **API data rendering** — field values from clearskies-api are rendered into the DOM. Values are passed to React as props and rendered through JSX, which escapes HTML by default. No `dangerouslySetInnerHTML` is used on API-sourced data.
3. **Operator-configured content** — about-page and legal-page content is served as markdown by the API. The dashboard renders it as plain text (React text node); no HTML injection.
4. **Third-party scripts and fonts** — the Geist font is bundled in the build artifact and served from the same origin. No external CDN scripts are loaded at runtime.

---

## Authentication

The dashboard has no user login, no session tokens, and no authentication credentials of any kind. It is a public-facing weather display.

Access control (password-protecting the site) is added at the reverse proxy layer. See [weewx-clearskies-stack INSTALL.md](https://github.com/clearskies-wx/weewx-clearskies-stack/blob/main/INSTALL.md) for Caddy and Apache examples.

---

## Content Security Policy (CSP)

The dashboard does not set a CSP header by itself — headers are set at the reverse proxy layer. Operators adding a strict CSP should allow at minimum:

- `script-src 'self'` — all JS is same-origin
- `style-src 'self' 'unsafe-inline'` — Tailwind CSS injects inline styles for the theme variables
- `connect-src 'self'` — API and SSE calls go to the same origin via the reverse proxy
- `font-src 'self'` — Geist font is bundled; no external font CDN
- `img-src 'self' data:` — operator logos may be served from the same origin or as data URIs

The inline `<script>` in `index.html` that applies the stored theme before React mounts requires `'unsafe-inline'` in `script-src`, or a nonce. A nonce-based approach requires the server to inject the nonce into every HTML response; this is not currently implemented.

---

## localStorage

The dashboard stores one key in `localStorage`:

| Key | Values | Purpose |
|---|---|---|
| `clearskies.theme.user-override` | `light` \| `dark` \| `system` | Stores the visitor's theme preference across page loads |

No personally identifiable information is stored in localStorage. No cookies are set by the dashboard.

---

## Third-party dependencies

Build-time dependencies are pinned in `package-lock.json`. The CI pipeline runs `npm audit --audit-level=high` and `gitleaks` on every pull request. The audit covers all transitive npm dependencies included in the built artifact.

The built artifact (`dist/`) does not include any npm package that makes outbound network requests at runtime — all runtime network calls are to the clearskies-api and realtime service on the same domain.

---

## Static file serving security

Operators serving the `dist/` directory should configure the web server with:

- **`X-Content-Type-Options: nosniff`** — prevent MIME sniffing of assets
- **`X-Frame-Options: DENY`** or a CSP `frame-ancestors` directive — prevent embedding in foreign frames
- **HTTPS** — the dashboard uses SSE (`EventSource`), which browsers will not connect to over plain HTTP when the page itself is HTTPS

---

## Known limitations and accepted risks

| Item | Status |
|---|---|
| Inline theme script in `index.html` requires `unsafe-inline` in CSP | Accepted at v0.1; nonce-based approach deferred |
| No integrity (SRI) hashes on self-hosted assets | Not applicable — all assets are same-origin |
| Operator logo URLs are not validated | The dashboard renders whatever URL the `/branding` endpoint returns; the API is responsible for validating its inputs |
