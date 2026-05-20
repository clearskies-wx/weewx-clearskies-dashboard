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
      // clearskies-api service (REST).  Default bind_port: 8765.
      "/api": {
        target: "http://localhost:8765",
        changeOrigin: true,
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
