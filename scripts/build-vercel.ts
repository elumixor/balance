#!/usr/bin/env bun
// Builds the whole product into a single Vercel deployment: the Expo web app as static files,
// the Nitro API as the one serverless function behind them. Both live at the same origin, so the
// web client calls `/mobile/*` without CORS and there is one URL to remember.
import { existsSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
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

await rm(webDir, { recursive: true, force: true });
await $`bunx expo export --platform web --output-dir ${webDir}`.cwd(frontend);

await rm(nitroOutput, { recursive: true, force: true });
await $`bunx nitro build --preset vercel`.cwd(backend);

await rm(finalOutput, { recursive: true, force: true });
await rename(nitroOutput, finalOutput);

await writeCleanUrlOverrides();

/**
 * Teaches Vercel the two things Nitro's generated config can't know: that Expo's per-route files
 * (`track.html`) answer to the URL people actually type (`/track`), and that an unknown path is a
 * missing app screen rather than a missing API route.
 */
async function writeCleanUrlOverrides() {
  const configPath = join(finalOutput, "config.json");
  const config = await Bun.file(configPath).json();
  const staticDir = join(finalOutput, "static");
  if (!existsSync(staticDir)) throw new Error(`No static output at ${staticDir} — did the web export land?`);

  // The Build Output API has no `cleanUrls` flag; an `overrides` entry per file is the equivalent.
  const overrides: Record<string, { path: string }> = { ...config.overrides };
  for (const entry of await readdir(staticDir, { withFileTypes: true })) {
    // Route-group folders (`(app)/track.html`) duplicate the flat routes Expo also emits.
    if (!entry.isFile() || !entry.name.endsWith(".html") || entry.name === "index.html") continue;
    overrides[entry.name] = { path: entry.name.replace(/\.html$/, "") };
  }
  config.overrides = overrides;

  // Nitro ends its routes with a catch-all into the function, which would answer an unknown web
  // path with an API-shaped 404 JSON body. Hand those to the app's own not-found screen instead.
  const catchAll = config.routes.findIndex((route: { dest?: string }) => route.dest === "/__fallback");
  config.routes.splice(
    catchAll < 0 ? config.routes.length : catchAll,
    0,
    {
      // `/` has no file of its own for the filesystem handler to find.
      src: "/",
      dest: "/index.html",
    },
    {
      src: `/((?!${API_PREFIXES.join("|")}).*)`,
      dest: "/+not-found.html",
      status: 404,
    },
  );

  await Bun.write(configPath, JSON.stringify(config, null, 2));
  console.log(`Mapped ${Object.keys(overrides).length} clean URLs`);
}
