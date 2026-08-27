import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // M1 CS-BASEMAP dev-only, env-gated: when BASEMAP_DEV_ORIGIN is set,
      // serve the basemap tiers/status from a local static file server
      // (e.g. `npx http-server scratch/basemap-dev -p 8799 --cors -s`)
      // instead of a real API host — lets the round render the real dark
      // basemap before any deploy. No effect on the build or on anyone who
      // doesn't set the env var (falls through to the "/api" rule below,
      // same as every other endpoint).
      ...(process.env.BASEMAP_DEV_ORIGIN
        ? {
            "/api/v1/basemap": {
              target: process.env.BASEMAP_DEV_ORIGIN,
              changeOrigin: true,
              secure: false,
              rewrite: (pathname: string) =>
                pathname
                  .replace(/^\/api\/v1\/basemap\/(\w+)\/tiles$/, "/basemap-$1.pmtiles")
                  .replace(/^\/api\/v1\/basemap\/status$/, "/status.json"),
            },
          }
        : {}),
      // clearskies-api service (REST).  Default bind_port: 8765.
      "/api": {
        target: process.env.API_DEV_ORIGIN ?? "http://localhost:8765",
        changeOrigin: true,
        secure: false,
      },
      // clearskies-realtime service (SSE).
      // Both services default to bind_port 8765 in their settings.py, but
      // they MUST run on different ports in a dev setup — only one process
      // can bind a port.  The realtime service is typically started on 8766
      // locally.  Override by setting the target in a .env.local if your
      // setup differs.  In production, the reverse proxy (Caddy, ADR-037)
      // routes /sse to the realtime service; VITE_SSE_URL is used there.
      "/sse": {
        target: "http://localhost:8766",
        changeOrigin: true,
      },
    },
  },
});
