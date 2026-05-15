import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appVersion = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
}).version;

function pagesBase(): string {
  const raw = process.env.VITE_BASE_PATH;
  if (!raw || raw === "/") return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const host = process.env.TAURI_DEV_HOST;
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  base: isTauri ? "/" : pagesBase(),
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
  build: isTauri
    ? {
        target:
          process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
        minify: process.env.TAURI_ENV_DEBUG ? false : true,
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
      }
    : undefined,
});
