#!/usr/bin/env bun
// Builds the web bundle against the deployed API, syncs it into the Xcode project and hands the
// archive to fastlane, which signs the app, the watch app and the widget and uploads to TestFlight.
// The same lane CI used to run — it just runs on this machine now, against the certificate in the
// login keychain and the App Store Connect key on disk.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
const frontend = join(root, "apps/frontend");
const backend = join(root, "apps/backend");
const ios = join(frontend, "ios");

const apiBaseUrl = process.env.DEPLOY_API_BASE_URL ?? "https://balance-app-mauve.vercel.app";

// fastlane needs a modern Ruby; macOS still ships 2.6, which its gems no longer install against.
// `bundle` is called by full path because Bun's shell resolves a command against its own PATH
// before the env below is applied, and would find /usr/bin/bundle — the system Ruby's.
const rubyBin = "/opt/homebrew/opt/ruby/bin";
const bundle = join(rubyBin, "bundle");
if (!existsSync(bundle)) throw new Error("No Homebrew Ruby at /opt/homebrew/opt/ruby — `brew install ruby`");

const keyPath = process.env.APP_STORE_CONNECT_API_KEY_PATH ?? defaultKeyPath();
const env = {
  ...process.env,
  PATH: `${rubyBin}:${process.env.PATH}`,
  APP_STORE_CONNECT_API_KEY_ID: required("APP_STORE_CONNECT_API_KEY_ID"),
  APP_STORE_CONNECT_API_KEY_ISSUER_ID: required("APP_STORE_CONNECT_API_KEY_ISSUER_ID"),
  APP_STORE_CONNECT_API_KEY_PATH: keyPath,
  FASTLANE_SKIP_UPDATE_CHECK: "1",
  FASTLANE_HIDE_CHANGELOG: "1",
};
if (!existsSync(keyPath)) throw new Error(`No App Store Connect key at ${keyPath}`);

// Same order as a web deploy: the typed client is generated from the routes the app compiles
// against. `bun run deploy` generates it once up front, because two builds writing those files at
// the same time is the one thing running in parallel can't survive.
if (!process.env.SKIP_CLIENT_GEN) await $`bunx nitro-client`.cwd(backend);

// The web build a release ships to Vercel is happening in the next directory over, against the
// same sources — this one gets its own output, cache and Capacitor web root so neither sees half
// of the other's build.
const buildEnv = {
  ...process.env,
  VITE_API_BASE_URL: apiBaseUrl,
  BUILD_DIR: "build-ios",
  KIT_DIR: ".svelte-kit-ios",
  VITE_CACHE_DIR: "node_modules/.vite-ios",
};
await $`bun run build`.cwd(frontend).env(buildEnv);
await $`bunx cap sync ios`.cwd(frontend).env(buildEnv);

// `cap sync` reports a failed copy and still exits 0, which would archive whatever web assets the
// project happened to be carrying from a previous build.
const bundled = join(ios, "App/App/public/index.html");
if (!existsSync(bundled)) throw new Error(`cap sync didn't copy the web build — no ${bundled}`);

const installed = await $`${bundle} check`.cwd(ios).env(env).nothrow().quiet();
if (installed.exitCode !== 0) await $`${bundle} install`.cwd(ios).env(env);
await $`${bundle} exec fastlane beta`.cwd(ios).env(env);

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing — put it in the repo's .env (see README, "Releasing")`);
  return value;
}

/** The key fastlane looks for by convention, named after the key id. */
function defaultKeyPath() {
  const id = required("APP_STORE_CONNECT_API_KEY_ID");
  return join(homedir(), ".appstoreconnect/private_keys", `AuthKey_${id}.p8`);
}
