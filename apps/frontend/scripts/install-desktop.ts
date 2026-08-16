/**
 * Builds the macOS app and puts it in /Applications.
 *
 * The bundle is unsigned — there is no Developer ID on this project yet — which is fine for the
 * machine that built it: Gatekeeper only refuses apps carrying a quarantine flag, and one copied
 * off local disk never gets one. It is not fine for handing to anyone else.
 */

import { existsSync } from "node:fs";
import { $ } from "bun";

const BUNDLE = "src-tauri/target/release/bundle/macos/Balance.app";
const INSTALLED = "/Applications/Balance.app";

await $`bunx tauri build --bundles app`;

if (!existsSync(BUNDLE)) {
  console.error(`Expected a bundle at ${BUNDLE} and there isn't one.`);
  process.exit(1);
}

// A running copy holds its own files open, and replacing them underneath it leaves a half-app.
await $`osascript -e 'quit app "Balance"'`.nothrow().quiet();
await $`rm -rf ${INSTALLED}`;
await $`cp -R ${BUNDLE} ${INSTALLED}`;
// Belt and braces: strips a quarantine flag if the bundle ever picks one up.
await $`xattr -cr ${INSTALLED}`.nothrow().quiet();

console.log(`Installed ${INSTALLED}. Open it from Spotlight or /Applications.`);
