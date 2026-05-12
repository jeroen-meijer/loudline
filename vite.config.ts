import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: set VITE_BASE=/repo-name/ when building.
function normalizeBase(raw: string | undefined): string {
  if (!raw || raw === "/") return "/";
  const trimmed = raw.trim();
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.VITE_BASE);

export default defineConfig({
  plugins: [react()],
  base,
});
