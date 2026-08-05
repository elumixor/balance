import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // The app is one client-side bundle: it ships inside a Capacitor webview and,
    // on the web, sits behind the same Nitro deployment that serves `/mobile/*`.
    adapter: adapter({ fallback: "index.html" }),
  },
};

export default config;
