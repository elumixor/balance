import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
// A release builds the app twice with different settings — same-origin for the web, an absolute
// API URL for the native shells — and `bun run deploy` does both at once, so each build needs its
// own directories or they overwrite each other's output halfway through.
const buildDir = process.env.BUILD_DIR ?? "build";
const kitDir = process.env.KIT_DIR ?? ".svelte-kit";

const config = {
  preprocess: vitePreprocess(),
  kit: {
    // The app is one client-side bundle: it ships inside a Capacitor webview and,
    // on the web, sits behind the same Nitro deployment that serves `/mobile/*`.
    adapter: adapter({ pages: buildDir, assets: buildDir, fallback: "index.html" }),
    outDir: kitDir,
  },
};

export default config;
