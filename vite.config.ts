import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import packageJson from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  css: {
    // SCSS (src/styles/*.scss, components' *.module.scss) through Dart Sass' modern compiler API
    preprocessorOptions: { scss: { api: "modern-compiler" } },
  },
  plugins: [
    react(),
    // `npm run dev:lan` — HTTPS + LAN: the camera (QR scan) only opens in a secure
    // context, so testing on a phone needs https://<mac-ip>:5173 (accept the
    // self-signed certificate once on the phone).
    ...(process.env.DEV_LAN ? [basicSsl()] : []),
    // Installable PWA. The service worker precaches the whole build (JS, CSS,
    // every image) so the app opens with zero network — the data itself lives
    // in localStorage (see src/store) and is fed by the WebSocket.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        id: "/",
        name: "Acampa Kids · IP Alphaville",
        short_name: "Acampa Kids",
        description: "Gestão do acampamento de crianças da Igreja Presbiteriana em Alphaville",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#183d36",
        theme_color: "#183d36",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
        // the paper-cut art is a few hundred KB each — raise the default 2 MiB limit just in case
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        // never try to cache the API / websocket. The IPAlpha popup and the One Tap frame
        // (/one-tap) live on the auth origin, so this worker never sees those navigations.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // images uploaded through the editor (preparation / instructions) are immutable:
        // cache them on first sight so they still show with no connectivity at the camp
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/api\/files\/[a-f0-9]+$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "acampa-files",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // the photo album's thumbnails (immutable like the files): cached on
          // first sight so the Fotos grid still renders with no connectivity
          {
            urlPattern: ({ url }) => /\/api\/gallery\/[a-f0-9]+\/thumb$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "acampa-thumbs",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: process.env.DEV_LAN ? true : undefined,
    // the app talks to its own origin; in dev that is proxied to the backend
    // (REST + the realtime websocket), so a phone on the LAN never needs to
    // reach localhost:3000 nor pass CORS.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true, ws: true },
    },
  },
});
