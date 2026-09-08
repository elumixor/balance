/**
 * Packs the built macOS app as an update and stages the manifest the installed app reads.
 *
 * The website has always handed out a DMG, which only ever reaches a Mac that goes looking for it.
 * The updater reads `/download/latest.json` instead: a version, a tarball of the same `.app` the
 * DMG wraps, and a signature made with the key in `TAURI_SIGNING_PRIVATE_KEY`. The app refuses an
 * update whose signature doesn't match the public key committed in `tauri.conf.json`, which is the
 * whole reason a stolen deployment can't push code onto anybody's machine.
 *
 * Runs after devkit's `desktop` deploy target, in the same `dist/download` it staged the DMG into,
 * and before the Vercel build that packages that directory into the site.
 */

import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

const frontendDir = "apps/frontend";
const stageDir = "dist/download";
const bundleDir = join(frontendDir, "src-tauri/target/release/bundle/macos");

const { version, productName } = (await Bun.file(join(frontendDir, "src-tauri/tauri.conf.json")).json()) as {
  version: string;
  productName: string;
};

const app = join(bundleDir, `${productName}.app`);

// The tarball is handed out by the blob store `scripts/publish-download.ts` writes to, and the
// manifest has to name it there: the site only redirects, and an updater is a poor place to find
// out whether something follows redirects.
const downloadBaseUrl = process.env.DOWNLOAD_BASE_URL;
if (!downloadBaseUrl) throw new Error("DOWNLOAD_BASE_URL is missing — put it in the repo's .env");

// Bundling a DMG consumes the `.app` it packages, so whether one is still here depends on whether
// the deploy also asked for the `app` target. Rebuilding it costs a bundling pass, not a compile —
// the release binary in `target/` is the one that was just built.
if (!existsSync(app)) {
  console.log(`No ${app} left by the deploy — bundling one`);
  await $`bunx tauri build --bundles app`.cwd(frontendDir);
  if (!existsSync(app)) throw new Error(`Still no bundle at ${app}`);
}

await mkdir(stageDir, { recursive: true });
// Absolute, because the signer runs in the frontend directory and this is written from the root.
const tarball = resolve(stageDir, `${productName}.app.tar.gz`);

// The updater expects the `.app` at the root of the archive, with nothing above it.
await $`tar -czf ${tarball} -C ${bundleDir} ${`${productName}.app`}`;

const key = process.env.TAURI_SIGNING_PRIVATE_KEY;
if (!key) throw new Error("TAURI_SIGNING_PRIVATE_KEY is missing — put it in the repo's .env");
// `-f` takes the key as a path, `-k` the key itself — the .env carries one or the other.
const keyArgs = existsSync(key) ? ["-f", key] : ["-k", key];
// The password goes through the environment rather than `-p`: an empty argument disappears from
// the command line, and the signer then reads the file to sign as the password instead.
await $`bunx tauri signer sign ${keyArgs} ${tarball}`
  .cwd(frontendDir)
  .env({ ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" })
  .quiet();

const signature = (await Bun.file(`${tarball}.sig`).text()).trim();

// One platform, because one is what gets built: the release is an Apple Silicon bundle, and an
// Intel Mac asking for `darwin-x86_64` is better told there is no update than handed one it can't
// run. Rosetta reports itself as aarch64 under Tauri, so a Mac running the app translated still
// matches the entry it was installed from.
await Bun.write(
  join(stageDir, "latest.json"),
  `${JSON.stringify(
    {
      version,
      pub_date: new Date().toISOString(),
      platforms: {
        "darwin-aarch64": {
          signature,
          url: `${downloadBaseUrl}/download/${productName}.app.tar.gz`,
        },
      },
    },
    null,
    2,
  )}\n`,
);

const { size } = await stat(tarball);
console.log(`Staged ${productName}.app.tar.gz (${(size / 1e6).toFixed(1)} MB) as version ${version}`);
