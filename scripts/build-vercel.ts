#!/usr/bin/env bun
// Builds the whole product into a single Vercel deployment: the Expo web app as static files,
// the Nitro API as the one serverless function behind them. Both live at the same origin, so the
// web client calls `/mobile/*` without CORS and there is one URL to remember.
import { existsSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

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
 * Expo's static export writes one file per route (`track.html`), but people type `/track`. Vercel's
 * Build Output API has no `cleanUrls` flag — the equivalent is an `overrides` entry per file, so
 * generate them from what was actually exported.
 */
async function writeCleanUrlOverrides() {
  const configPath = join(finalOutput, "config.json");
  const config = await Bun.file(configPath).json();
  const staticDir = join(finalOutput, "static");
  if (!existsSync(staticDir)) throw new Error(`No static output at ${staticDir} — did the web export land?`);

  const overrides: Record<string, { path: string }> = { ...config.overrides };
  for (const entry of await readdir(staticDir, { withFileTypes: true })) {
    // Route-group folders (`(app)/track.html`) duplicate the flat routes Expo also emits.
    if (!entry.isFile() || !entry.name.endsWith(".html") || entry.name === "index.html") continue;
    overrides[entry.name] = { path: entry.name.replace(/\.html$/, "") };
  }

  config.overrides = overrides;
  await Bun.write(configPath, JSON.stringify(config, null, 2));
  console.log(`Mapped ${Object.keys(overrides).length} clean URLs`);
}
