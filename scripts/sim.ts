#!/usr/bin/env bun
// Builds the watch app and runs it on a simulator, without going through Xcode.
//
// The watch has no sign-in of its own — it redeems a ticket the phone app pushes across — so on a
// simulator with no paired iPhone it can only ever show "Open Balance on your iPhone". This runs it
// against `WatchPreview`'s sample week instead, which is the whole point: the ring, the close-up and
// the duration dial are gestures, and gestures have to be felt rather than screenshotted.
//
// Pass `--real` to launch it as it ships, talking to the API like any other build.
import { resolve } from "node:path";
import { $ } from "bun";

const project = resolve(import.meta.dir, "../apps/frontend/ios/App/App.xcodeproj");
const derived = resolve(import.meta.dir, "../apps/frontend/ios/App/build/sim");
const bundleID = "com.elumixor.balance.watchkitapp";

/** Overridable, because everyone's list of installed simulators differs. */
const deviceName = process.env.SIM_WATCH ?? "Apple Watch Series 11 (46mm)";
const preview = !process.argv.includes("--real");

const udid = await boot();

await $`xcodebuild -project ${project} -scheme BalanceWatch -configuration Debug \
  -destination id=${udid} -derivedDataPath ${derived} build`.quiet();

await $`xcrun simctl install ${udid} ${derived}/Build/Products/Debug-watchsimulator/BalanceWatch.app`;
await $`xcrun simctl terminate ${udid} ${bundleID}`.nothrow().quiet();
// `SIMCTL_CHILD_` is how simctl passes an environment on to the app it launches.
await $`xcrun simctl launch ${udid} ${bundleID}`.env({
  ...process.env,
  ...(preview ? { SIMCTL_CHILD_BALANCE_WATCH_PREVIEW: "1" } : {}),
});

console.log(`BalanceWatch running on ${deviceName}${preview ? " with sample data" : ""}`);

/** Boots the simulator if it isn't already up, and returns its device id. */
async function boot() {
  const { devices } = await $`xcrun simctl list devices available -j`.quiet().json();
  // The same model exists once per installed runtime; the newest one is the one to use.
  const runtimes = Object.keys(devices).sort().reverse();
  const match = runtimes
    .flatMap((runtime) => devices[runtime] as { name: string; udid: string; state: string }[])
    .find((device) => device.name === deviceName);

  if (!match) throw new Error(`No simulator called "${deviceName}" — see \`xcrun simctl list devices available\``);
  if (match.state !== "Booted") await $`xcrun simctl boot ${match.udid}`;
  await $`open -a Simulator`;
  return match.udid;
}
