#!/usr/bin/env bun
// Builds the macOS app and stages it for the website to hand out. The deployment serves the DMG
// itself — one origin for the web app, the API and the download — so there is no release page to
// keep in step with what was actually built.
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
const frontend = join(root, "apps/frontend");
const bundleDir = join(frontend, "src-tauri/target/release/bundle/dmg");
const appBundle = join(frontend, "src-tauri/target/release/bundle/macos/Balance.app");
const staged = join(root, "dist/download");
const installed = "/Applications/Balance.app";

const version = (await Bun.file(join(frontend, "src-tauri/tauri.conf.json")).json()).version as string;

// macOS refuses a downloaded app that carries no signature at all — "Balance is damaged and can't
// be opened" — so the bundle is always signed with something. A Developer ID certificate in the
// keychain also buys notarization, which is the only thing that makes the app open on a click; an
// ad-hoc signature just moves the refusal to a dialog the user can override in System Settings.
const identity = await developerId();
if (identity) console.log(`Signing as ${identity}, and notarizing`);
else console.log("No Developer ID certificate — signing ad-hoc, so the app needs Open Anyway once");

await $`bunx tauri build --bundles dmg`.cwd(frontend).env({
  ...process.env,
  APPLE_SIGNING_IDENTITY: identity ?? "-",
  ...(identity
    ? {
        APPLE_API_KEY: required("APP_STORE_CONNECT_API_KEY_ID"),
        APPLE_API_ISSUER: required("APP_STORE_CONNECT_API_KEY_ISSUER_ID"),
        APPLE_API_KEY_PATH: keyPath(),
      }
    : {}),
});

const dmg = (await readdir(bundleDir)).find((name) => name.endsWith(".dmg"));
if (!dmg) throw new Error(`No .dmg in ${bundleDir}`);

// Tauri notarizes and staples the app, then signs the DMG around it — leaving the DMG itself
// unnotarized, which is what Gatekeeper judges when someone opens the file they downloaded.
if (identity) await notarize(join(bundleDir, dmg));

await rm(staged, { recursive: true, force: true });
await mkdir(staged, { recursive: true });
await $`cp ${join(bundleDir, dmg)} ${join(staged, "Balance.dmg")}`;

// What the settings panel prints next to the button. The app can't read the file's own size or
// age once it's behind a CDN, and a download button that says nothing about what it is asking you
// to install is a worse button.
const { size } = await stat(join(staged, "Balance.dmg"));
await Bun.write(
  join(staged, "desktop.json"),
  `${JSON.stringify(
    { version, bytes: size, builtAt: new Date().toISOString(), arch: "Apple Silicon", notarized: Boolean(identity) },
    null,
    2,
  )}\n`,
);

console.log(`Staged ${dmg} (${(size / 1e6).toFixed(1)} MB) for the web deployment`);

// "Configured" means this machine already has the app installed — a fresh checkout building for the
// web deploy shouldn't plant a copy nobody asked for.
if (existsSync(installed)) {
  await $`osascript -e 'quit app "Balance"'`.nothrow().quiet();
  await $`rm -rf ${installed}`;
  await $`cp -R ${appBundle} ${installed}`;
  await $`xattr -cr ${installed}`.nothrow().quiet();
  console.log(`Reinstalled ${installed}`);
}

/** Sends the disk image to Apple and staples their answer into it, so it opens offline too. */
async function notarize(path: string) {
  const key = [
    "--key",
    keyPath(),
    "--key-id",
    required("APP_STORE_CONNECT_API_KEY_ID"),
    "--issuer",
    required("APP_STORE_CONNECT_API_KEY_ISSUER_ID"),
  ];
  await $`xcrun notarytool submit ${path} ${key} --wait`;
  await $`xcrun stapler staple ${path}`;
}

/** The Developer ID identity in this machine's keychain, if the account has one yet. */
async function developerId() {
  const found = await $`security find-identity -v -p codesigning`.quiet().nothrow();
  const line = found.stdout
    .toString()
    .split("\n")
    .find((row) => row.includes("Developer ID Application"));
  return line?.match(/"([^"]+)"/)?.[1];
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing — put it in the repo's .env (see README, "Releasing")`);
  return value;
}

/** Notarization takes the same App Store Connect key the iOS release uses. */
function keyPath() {
  return (
    process.env.APP_STORE_CONNECT_API_KEY_PATH ??
    join(homedir(), ".appstoreconnect/private_keys", `AuthKey_${required("APP_STORE_CONNECT_API_KEY_ID")}.p8`)
  );
}
