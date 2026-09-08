/**
 * Puts the macOS build somewhere a web deployment can't take it away.
 *
 * The app people download and the update every installed copy asks for are made by a Tauri build
 * on a Mac. The website used to carry them inside its own deployment, which meant the newest site
 * and the newest Mac app had to be the same deploy: a cloud build of the site — the ordinary thing
 * a merge now does — would have shipped without them, and `/download/latest.json` would have
 * become a 404 on every machine holding the app.
 *
 * So the files live in a Vercel Blob store instead, written here by whoever built them, and
 * `/download/*` on the site redirects into it. Deploying the site touches none of it, and this
 * runs from a laptop or a runner with nothing but `BLOB_READ_WRITE_TOKEN`.
 */

import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { put } from "@vercel/blob";

const stageDir = "dist/download";
const prefix = "download";

// The manifest is read by an app deciding whether to update itself, so a stale copy in a CDN is a
// machine that quietly stays behind. The bundles it points at never change under a given name.
const CACHE_SECONDS: Record<string, number> = { ".json": 60 };
const DEFAULT_CACHE_SECONDS = 300;

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".dmg": "application/x-apple-diskimage",
  ".gz": "application/gzip",
  ".sig": "text/plain",
};

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is missing — put it in the repo's .env");

const files = await readdir(stageDir).catch(() => {
  throw new Error(`Nothing staged at ${stageDir} — build the Mac app first (bunx devkit deploy:mac)`);
});
if (!files.length) throw new Error(`${stageDir} is empty — there is nothing to publish`);

for (const file of files) {
  const extension = extname(file);
  const blob = await put(`${prefix}/${file}`, Bun.file(join(stageDir, file)), {
    access: "public",
    token,
    // The path is the address the site redirects to, so it has to be the same one every release.
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: CONTENT_TYPES[extension],
    cacheControlMaxAge: CACHE_SECONDS[extension] ?? DEFAULT_CACHE_SECONDS,
  });
  console.log(`Published ${file} -> ${blob.url}`);
}
