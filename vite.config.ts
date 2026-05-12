import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function pagesBase(): string {
  const raw = process.env.VITE_BASE_PATH;
  if (!raw || raw === "/") return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

export default defineConfig({
  base: pagesBase(),
  plugins: [react()],
  // Allow `vite preview --host 0.0.0.0` behind ngrok / LAN hostnames (random *.ngrok-free.app per session).
  preview: {
    allowedHosts: true,
  },
  server: {
    allowedHosts: true,
  },
});
