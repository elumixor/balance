/**
 * Ships the native phone app (with its watch app and widget) to TestFlight from this machine —
 * the same fastlane lane CI runs on a merge into `develop`.
 *
 * The app is Swift through and through, so there is no web bundle to build first: what a build
 * talks to is the one thing it takes from outside, `DEPLOY_API_BASE_URL` (production unless
 * said), which the lane writes into the app's Info.plist.
 *
 *   bunx devkit deploy iphone
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const iosDir = join(import.meta.dir, "../apps/frontend/ios");

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing — put it in the repo's .env`);
  return value;
}

// fastlane needs a modern Ruby; macOS still ships 2.6. `bundle` is named by full path because Bun's
// shell resolves a command before the env below applies, and would find the system one.
const rubyBin = "/opt/homebrew/opt/ruby/bin";
const bundle = join(rubyBin, "bundle");
if (!existsSync(bundle)) throw new Error("No Homebrew Ruby at /opt/homebrew/opt/ruby — `brew install ruby`");

const keyId = required("APP_STORE_CONNECT_API_KEY_ID");
const keyPath =
  process.env.APP_STORE_CONNECT_API_KEY_PATH ?? join(homedir(), ".appstoreconnect/private_keys", `AuthKey_${keyId}.p8`);
if (!existsSync(keyPath)) throw new Error(`No App Store Connect key at ${keyPath}`);

const env = {
  ...process.env,
  PATH: `${rubyBin}:${process.env.PATH}`,
  APP_STORE_CONNECT_API_KEY_ID: keyId,
  APP_STORE_CONNECT_API_KEY_ISSUER_ID: required("APP_STORE_CONNECT_API_KEY_ISSUER_ID"),
  APP_STORE_CONNECT_API_KEY_PATH: keyPath,
  VITE_API_BASE_URL: process.env.DEPLOY_API_BASE_URL ?? "https://balance-app-mauve.vercel.app",
  FASTLANE_SKIP_UPDATE_CHECK: "1",
  FASTLANE_HIDE_CHANGELOG: "1",
};

const installed = await $`${bundle} check`.cwd(iosDir).env(env).nothrow().quiet();
if (installed.exitCode !== 0) await $`${bundle} install`.cwd(iosDir).env(env);
await $`${bundle} exec fastlane beta`.cwd(iosDir).env(env);
