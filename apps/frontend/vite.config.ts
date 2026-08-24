import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
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
 * Where a native build talks to when nothing said otherwise. Read from the release configuration
 * rather than written again here, so there is one deployed address in the repo.
 */
function deployedApiUrl(cwd: string) {
  const root = JSON.parse(readFileSync(resolve(cwd, "../../package.json"), "utf8"));
  return root.devkit?.deploy?.iphone?.options?.defaultApiBaseUrl as string | undefined;
}

/**
 * Where the app looks for the API. A release web build talks to its own origin — the same Vercel
 * deployment owns the static files and `/mobile/*` — so the base is empty and requests stay
 * same-origin. Native builds and dev servers need an absolute URL; in dev that's the machine's LAN
 * address, so a phone on the same network reaches the backend without extra configuration.
 */
function resolveApiBaseUrl(mode: string, cwd: string) {
  const declared = process.env.VITE_API_BASE_URL ?? loadEnv(mode, cwd, "VITE_").VITE_API_BASE_URL;
  if (declared !== undefined) return declared;
  if (mode === "development") return `http://${localIP()}:${API_PORT}`;
  // A native shell carries its own copy of this bundle and serves it from `https://localhost`
  // (iOS) or `tauri://` (macOS), so an empty base points every request at the bundle itself —
  // which answers with `index.html` and a 200, and the app parses a web page as a week. Only the
  // web build, which is served by the deployment that owns `/mobile/*`, can have no base at all.
  if (!isNativeBuild()) return "";
  const deployed = deployedApiUrl(cwd);
  if (!deployed) throw new Error("A native build needs VITE_API_BASE_URL — nothing to fall back to.");
  console.warn(`[vite] no VITE_API_BASE_URL for a native build — falling back to ${deployed}`);
  return deployed;
}

/**
 * Whether this build is one of the native shells' copies. `devkit` gives each of those its own
 * output directory so the two builds a release runs side by side can't overwrite each other —
 * which is also the one signal here that says who the bundle is for.
 */
function isNativeBuild() {
  const dir = process.env.BUILD_DIR;
  return Boolean(dir) && dir !== "build";
}

/**
 * Signing in as `DEV_AUTH_EMAIL` without signing in, for a simulator — see `lib/env.ts`.
 *
 * Fenced to a development build here rather than read straight off the environment, so a release
 * built on a machine whose `.env` has it on still ships with it off.
 */
function devAuth(mode: string, cwd: string) {
  if (mode !== "development") return { on: "0", email: "" };
  const env = { ...loadEnv(mode, cwd, ""), ...process.env };
  return { on: env.VITE_DEV_AUTH === "1" ? "1" : "0", email: env.DEV_AUTH_EMAIL ?? "" };
}

/**
 * What is actually running, stamped into the bundle at build time.
 *
 * The native shells carry their own copy of the frontend, so the app on screen can be older than
 * the checkout it came from and nothing on it would say so. The commit it was built from settles
 * that in one glance — see the line at the bottom of the settings dialog.
 */
function buildStamp() {
  const git = (command: string) => {
    try {
      return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      return "";
    }
  };
  const commit = git("git rev-parse --short HEAD") || "unknown";
  const dirty = git("git status --porcelain") ? "+" : "";
  return `${commit}${dirty}`;
}

/** One version for all three shells, kept where the macOS bundle already reads it from. */
function appVersion(cwd: string) {
  const config = JSON.parse(readFileSync(resolve(cwd, "src-tauri/tauri.conf.json"), "utf8"));
  return config.version as string;
}

export default defineConfig(({ mode }) => {
  const dev = devAuth(mode, process.cwd());
  return {
    plugins: [tailwindcss(), sveltekit()],
    // Rust build artefacts are far too many files to watch, and none of them change the page.
    server: { port: 8081, watch: { ignored: ["**/src-tauri/**"] } },
    // A release runs two builds of this app side by side (see svelte.config.js); they can't share
    // one transform cache either.
    cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(resolveApiBaseUrl(mode, process.cwd())),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion(process.cwd())),
      "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildStamp()),
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toISOString()),
      "import.meta.env.VITE_DEV_AUTH": JSON.stringify(dev.on),
      "import.meta.env.VITE_DEV_AUTH_EMAIL": JSON.stringify(dev.email),
    },
  };
});
