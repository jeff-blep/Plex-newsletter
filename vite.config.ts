import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server; proxy /api/* → backend on :3001
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",

      // compatibility for any legacy calls without /api
      "/config": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/config/, "/api/config"),
      },
      "/test-plex": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/test-plex/, "/api/test-plex"),
      },
      "/test-tautulli": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/test-tautulli/, "/api/test-tautulli"),
      },
      "/test-email": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/test-email/, "/api/test-email"),
      },
      "/send": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/send/, "/api/send"),
      },
    },
  },
});
