import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit / component tests (jsdom). Kept apart from vite.config.ts so the PWA plugin never runs here.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
  css: {
    preprocessorOptions: { scss: { api: "modern-compiler" } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    restoreMocks: true,
  },
});
