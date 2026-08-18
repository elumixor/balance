#!/usr/bin/env bun
// Builds the macOS app and stages it for the website to hand out. The deployment serves the DMG
// itself — one origin for the web app, the API and the download — so there is no release page to
// keep in step with what was actually built.
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
const frontend = join(root, "apps/frontend");
const bundleDir = join(frontend, "src-tauri/target/release/bundle/dmg");
const staged = join(root, "dist/download");

const version = (await Bun.file(join(frontend, "src-tauri/tauri.conf.json")).json()).version as string;

await $`bunx tauri build --bundles dmg`.cwd(frontend);

const dmg = (await readdir(bundleDir)).find((name) => name.endsWith(".dmg"));
if (!dmg) throw new Error(`No .dmg in ${bundleDir}`);

await rm(staged, { recursive: true, force: true });
await mkdir(staged, { recursive: true });
await $`cp ${join(bundleDir, dmg)} ${join(staged, "Balance.dmg")}`;

// What the settings panel prints next to the button. The app can't read the file's own size or
// age once it's behind a CDN, and a download button that says nothing about what it is asking you
// to install is a worse button.
const { size } = await stat(join(staged, "Balance.dmg"));
await Bun.write(
  join(staged, "desktop.json"),
  `${JSON.stringify({ version, bytes: size, builtAt: new Date().toISOString(), arch: "Apple Silicon" }, null, 2)}\n`,
);

console.log(`Staged ${dmg} (${(size / 1e6).toFixed(1)} MB) for the web deployment`);
