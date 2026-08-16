import { networkInterfaces } from "node:os";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

function localIP() {
  for (const iface of Object.values(networkInterfaces()).flat()) {
    if (iface?.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "localhost";
}

const API_PORT = 3100;

/**
 * Where the app looks for the API. A release web build talks to its own origin — the same Vercel
 * deployment owns the static files and `/mobile/*` — so the base is empty and requests stay
 * same-origin. Native builds and dev servers need an absolute URL; in dev that's the machine's LAN
 * address, so a phone on the same network reaches the backend without extra configuration.
 */
function resolveApiBaseUrl(mode: string, cwd: string) {
  const declared = process.env.VITE_API_BASE_URL ?? loadEnv(mode, cwd, "VITE_").VITE_API_BASE_URL;
  if (declared !== undefined) return declared;
  return mode === "development" ? `http://${localIP()}:${API_PORT}` : "";
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), sveltekit()],
  // Rust build artefacts are far too many files to watch, and none of them change the page.
  server: { port: 8081, watch: { ignored: ["**/src-tauri/**"] } },
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(resolveApiBaseUrl(mode, process.cwd())),
  },
}));
