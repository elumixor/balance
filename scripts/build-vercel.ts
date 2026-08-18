#!/usr/bin/env bun
// Builds the whole product into a single Vercel deployment: the SvelteKit app as static files,
// the Nitro API as the one serverless function behind them. Both live at the same origin, so the
// web client calls `/mobile/*` without CORS and there is one URL to remember.
import { existsSync } from "node:fs";
import { cp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

/** Paths the Nitro function owns; everything else belongs to the web app. */
const API_PREFIXES = ["mobile", "health"];

const root = resolve(import.meta.dir, "..");
const frontend = join(root, "apps/frontend");
const backend = join(root, "apps/backend");
const webDir = join(backend, "public");
const nitroOutput = join(backend, ".vercel/output");
const finalOutput = join(root, ".vercel/output");

// The typed client is generated from the route handlers, so it has to exist before the app
// compiles — unless a release already did it, in which case regenerating it now would be writing
// to files the iOS build running alongside is reading.
if (!process.env.SKIP_CLIENT_GEN) await $`bunx nitro-client`.cwd(backend);

await $`bun run build`.cwd(frontend);
await rm(webDir, { recursive: true, force: true });
await cp(join(frontend, "build"), webDir, { recursive: true });
await includeDesktopDownload();

await rm(nitroOutput, { recursive: true, force: true });
await $`bunx nitro build --preset vercel`.cwd(backend);

await rm(finalOutput, { recursive: true, force: true });
await rename(nitroOutput, finalOutput);

await routeUnmatchedPathsToTheApp();

/**
 * The macOS app, if a release built one (scripts/deploy-desktop.ts). It rides along with the web
 * files rather than living in the frontend's `static/`, because the iOS bundle copies that folder
 * wholesale and has no business carrying a Mac installer around.
 */
async function includeDesktopDownload() {
  const staged = join(root, "dist/download");
  if (!existsSync(staged)) return console.log("No macOS build staged — the site will offer no download");
  await cp(staged, join(webDir, "download"), { recursive: true });
  console.log("Serving the macOS app at /download/Balance.dmg");
}

/**
 * The app is one client-rendered bundle, so every path it owns has to answer with `index.html`
 * and let the router sort it out. Nitro ends its routes with a catch-all into the function, which
 * would otherwise answer an unknown web path with an API-shaped 404 JSON body.
 */
async function routeUnmatchedPathsToTheApp() {
  const configPath = join(finalOutput, "config.json");
  const config = await Bun.file(configPath).json();
  const staticDir = join(finalOutput, "static");
  if (!existsSync(staticDir)) throw new Error(`No static output at ${staticDir} — did the web build land?`);

  const catchAll = config.routes.findIndex((route: { dest?: string }) => route.dest === "/__fallback");
  config.routes.splice(catchAll < 0 ? config.routes.length : catchAll, 0, {
    src: `/((?!${API_PREFIXES.join("|")}).*)`,
    dest: "/index.html",
  });

  await Bun.write(configPath, JSON.stringify(config, null, 2));
  console.log("Unmatched web paths route to the app shell");
}
