# Installation — weewx-clearskies-dashboard

The dashboard is a static single-page application (SPA). After building, the output is a directory of HTML, CSS, and JavaScript files that any static file server or reverse proxy can serve. There is no server-side rendering and no runtime Node process required in production.

All weather data is fetched from [weewx-clearskies-api](https://github.com/inguy24/weewx-clearskies-api) at runtime. The API must be running and reachable before the dashboard will display data.

For the full stack (API + realtime service + dashboard + reverse proxy), see the Docker Compose deployment in [weewx-clearskies-stack](https://github.com/inguy24/weewx-clearskies-stack). The instructions here cover building and serving the dashboard on its own.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | Earlier versions are not tested |
| npm | 10+ | Bundled with Node 22 |
| weewx-clearskies-api | running | Required for the dashboard to fetch data |

Node 22 LTS is available from [nodejs.org](https://nodejs.org/) or via your system package manager. On Debian/Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v22.x.x
```

---

## Clone and install dependencies

```bash
git clone https://github.com/inguy24/weewx-clearskies-dashboard.git
cd weewx-clearskies-dashboard
npm install
```

---

## Development mode

The Vite development server provides hot module replacement (HMR) and proxies API requests to the clearskies-api.

```bash
npm run dev
```

The dev server starts at `http://localhost:5173` by default. Any request to `/api/*` is proxied to `http://localhost:8765` (the clearskies-api default port). Start clearskies-api before running `npm run dev` so the dashboard has data to display.

The proxy is configured in `vite.config.ts` and only applies in development. In production, the reverse proxy handles `/api` routing.

---

## Production build

```bash
npm run build
```

This runs a TypeScript type check (`tsc`) followed by the Vite production build. Output goes to `dist/`. The build fails if TypeScript reports errors.

Contents of `dist/` after a successful build:

```
dist/
  index.html
  assets/
    index-<hash>.js
    index-<hash>.css
    ...
```

The `index.html` file contains a small inline script that reads the user's theme preference from localStorage before React mounts, preventing a flash of the wrong theme on page load.

Verify the build locally before deploying:

```bash
npm run preview   # serves dist/ at http://localhost:4173
```

---

## Serving the production build

The `dist/` directory is served as static files. The web server must:

1. Serve `index.html` for any path that does not match a file on disk (required for client-side routing).
2. Route `/api/*` requests to clearskies-api (default: `http://127.0.0.1:8765`).
3. Route `/sse` or `/realtime/*` requests to clearskies-realtime if you are using live data (default: `http://127.0.0.1:8766`).

### Nginx example

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name weather.example.com;

    root /var/www/weewx-clearskies-dashboard/dist;
    index index.html;

    # Client-side routing — serve index.html for all non-file paths.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to clearskies-api.
    location /api/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy SSE for live current conditions.
    location /sse {
        proxy_pass http://127.0.0.1:8766;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

Replace `weather.example.com` with your domain and `/var/www/weewx-clearskies-dashboard/dist` with the path where you placed the build output.

For TLS, use certbot with the nginx plugin, or switch to Caddy (which handles TLS automatically). See [weewx-clearskies-stack](https://github.com/inguy24/weewx-clearskies-stack) for a complete Caddy configuration.

### Caddy example

```caddy
weather.example.com {
    root * /var/www/weewx-clearskies-dashboard/dist
    file_server

    # Client-side routing.
    handle_errors 404 {
        rewrite * /index.html
        file_server
    }

    # Proxy API requests.
    handle /api/* {
        reverse_proxy 127.0.0.1:8765
    }

    # Proxy SSE for live current conditions.
    handle /sse {
        reverse_proxy 127.0.0.1:8766
    }
}
```

---

## Deploying the build output

After running `npm run build`, copy the `dist/` directory to your web server:

```bash
rsync -av --delete dist/ user@your-server:/var/www/weewx-clearskies-dashboard/dist/
```

Or, if building on the server itself:

```bash
cd /opt/weewx-clearskies-dashboard
git pull
npm install
npm run build
# Nginx/Caddy serves /opt/weewx-clearskies-dashboard/dist directly — no copy needed.
```

---

## Docker Compose (full stack)

For a complete deployment including clearskies-api, clearskies-realtime, the dashboard, and a Caddy reverse proxy, use the stack repo:

```
https://github.com/inguy24/weewx-clearskies-stack
```

The stack repo includes a setup wizard for initial configuration and generates the environment files the components need.

---

## Verifying the installation

After the server is configured and the build is deployed:

1. Open `http://your-server/` in a browser — the dashboard should load and show the station name.
2. Open `http://your-server/api/v1/health` — should return `{"status": "ok"}`.
3. Check the browser developer console for network errors. Any 502 or 404 on `/api/` paths indicates the reverse proxy is not forwarding correctly.

If the dashboard loads but shows no data, confirm that clearskies-api is running and connected to the weewx archive database. Consult the [clearskies-api documentation](https://github.com/inguy24/weewx-clearskies-api) for API troubleshooting.
