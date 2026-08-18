#!/usr/bin/env bun
// One version for the whole product. The macOS shell's config holds it — it is the file the app
// already reads its version from at build time — and this writes that number everywhere else a
// build number is declared, so the App Store, the DMG and the line at the bottom of settings can't
// drift apart again.
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const frontend = join(root, "apps/frontend");
const tauriConfig = join(frontend, "src-tauri/tauri.conf.json");

const version = (await Bun.file(tauriConfig).json()).version as string;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${tauriConfig} has no plain x.y.z version: ${version}`);

// The watch app and the widget have no `MARKETING_VERSION` setting of their own — they are wired
// into the project by a script, not by Xcode's template — so their plists carry the number itself.
const watchPlists = ["App/WatchApp", "App/WatchWidget"].map((target) => join(frontend, "ios", target, "Info.plist"));

await Promise.all([
  edit(join(root, "package.json"), /("version":\s*")[^"]+/, version),
  edit(join(frontend, "package.json"), /("version":\s*")[^"]+/, version),
  edit(join(frontend, "src-tauri/Cargo.toml"), /(^version = ")[^"]+/m, version),
  // The Xcode project is the only place the iOS marketing version is written: each Info.plist
  // reads `$(MARKETING_VERSION)` from it.
  edit(join(frontend, "ios/App/App.xcodeproj/project.pbxproj"), /(MARKETING_VERSION = )[^;]+/g, version),
  edit(
    join(frontend, "ios/App/App/Info.plist"),
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+/,
    "$(MARKETING_VERSION)",
  ),
  ...watchPlists.map((plist) => edit(plist, /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+/, version)),
]);

console.log(`Version ${version} across the web app, the macOS bundle and every Apple target`);

/** Rewrites the part of `pattern` after its first capture group, leaving the rest of the file alone. */
async function edit(path: string, pattern: RegExp, value: string) {
  const before = await Bun.file(path).text();
  const after = before.replace(pattern, (_, prefix) => `${prefix}${value}`);
  if (after !== before) await Bun.write(path, after);
}
