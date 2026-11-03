/**
 * Puts the macOS build somewhere a web deployment can't take it away.
 *
 * The app people download and the update every installed copy asks for are made by a Tauri build
 * on a Mac. The website used to carry them inside its own deployment, which meant the newest site
 * and the newest Mac app had to be the same deploy: a cloud build of the site — the ordinary thing
 * a merge now does — would have shipped without them, and `/download/latest.json` would have
 * become a 404 on every machine holding the app.
 *
 * So the files live in the Devkit Cloud blob store instead, written here by whoever built them,
 * and `/download/*` on the site redirects into it (`/_blob/download/*`). Deploying the site touches
 * none of it, and this runs from a laptop with the `devkit` AWS profile.
 */

import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

// The blob module reads where to write from the environment the platform gives the function; here,
// outside it, the same values name the production stage of this project.
if (!process.env.AWS_ACCESS_KEY_ID) process.env.AWS_PROFILE ??= "devkit";
process.env.DK_PROJECT ??= "balance";
process.env.DK_STAGE ??= "production";
process.env.DK_HOST ??= "balance.desk.atmagaming.com";
process.env.DK_BLOB_BUCKET ??= "dk-blobs-453953529857";

const { put } = await import("@elumixor/devkit/blob");

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

const files = await readdir(stageDir).catch(() => {
  throw new Error(`Nothing staged at ${stageDir} — build the Mac app first (bunx devkit deploy:mac)`);
});
if (!files.length) throw new Error(`${stageDir} is empty — there is nothing to publish`);

for (const file of files) {
  const extension = extname(file);
  // The path is the address the site redirects to, so it has to be the same one every release.
  const blob = await put(`${prefix}/${file}`, await Bun.file(join(stageDir, file)).bytes(), {
    access: "public",
    contentType: CONTENT_TYPES[extension],
    cacheControl: `public, max-age=${CACHE_SECONDS[extension] ?? DEFAULT_CACHE_SECONDS}`,
  });
  console.log(`Published ${file} -> ${blob.url}`);
}
