import { defineNitroConfig } from "nitropack/config";

// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  imports: false,
  // The Expo web build is exported into `public/` (relative to the package root, hence `../` from
  // `srcDir`) and shipped by this same deployment, so the web app and `/mobile/*` share an origin.
  publicAssets: [{ dir: "../public" }],
});
