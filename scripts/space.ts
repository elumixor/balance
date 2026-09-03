/**
 * Reports — and, with `--clean`, reclaims — the disk a build of this repo leaves behind.
 *
 * Nothing here is a source file. Every path below is something a compiler wrote and a compiler
 * will write again, and each one grows without a ceiling: Xcode's derived data keeps a full copy
 * of every SwiftPM binary artefact the project resolves (Sentry's XCFramework alone is ~3 GB),
 * SourceKit-LSP writes a second one into `BalanceKit/.build/index-build` the moment an editor
 * opens a Swift file, cargo keeps the objects of every dependency version it has ever built, a
 * simulator keeps whatever the app wrote to it since the day it was created, and Xcode keeps an
 * archive per upload forever. Left alone that reached 40 GB on a 460 GB disk, most of it stale.
 *
 * The rules are conservative on purpose. Anything touched inside `--days` (default 14) is left
 * where it is, because a working tree that recompiles from scratch every Monday costs more than
 * the disk it saves; the two simulators actually in use are never erased; and the three newest
 * archive days survive, since a dSYM is the only way to read a crash out of a build that shipped.
 *
 *   bun scripts/space.ts            # what is there, and what would go
 *   bun scripts/space.ts --clean    # take it
 *
 * `bun run space` and `bun run space:clean` are the same two commands, and a weekly launchd job
 * (`scripts/install-space-agent.ts`) runs the second one so this never has to be remembered.
 */

import { existsSync } from "node:fs";
import { readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const clean = process.argv.includes("--clean");
const daysFlag = process.argv.find((arg) => arg.startsWith("--days="));
const days = daysFlag ? Number(daysFlag.split("=")[1]) : 14;
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

const root = resolve(import.meta.dir, "..");
const home = homedir();

let reclaimed = 0;

function human(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** `du` rather than a walk: these trees hold hundreds of thousands of files. */
async function size(path: string) {
  if (!existsSync(path)) return 0;
  const out = await $`du -sk ${path}`.quiet().nothrow().text();
  return (Number(out.trim().split(/\s+/)[0]) || 0) * 1024;
}

/**
 * Whether anything near the top of a tree was written since the cutoff — a derived data directory
 * touched today is one somebody is working in.
 *
 * The reference is a stamp file rather than `-newermt`, because the `find` on this machine may be
 * bfs, which rejects the fractional seconds an ISO timestamp carries. A comparison that can't be
 * made counts as recent: deleting a tree because the question failed is the one outcome worth
 * ruling out.
 */
async function lastTouched(path: string) {
  const stamp = join(tmpdir(), `space-cutoff-${process.pid}`);
  if (!existsSync(stamp)) {
    await writeFile(stamp, "");
    await utimes(stamp, new Date(cutoff), new Date(cutoff));
  }
  const found = await $`find ${path} -maxdepth 3 -newer ${stamp}`.quiet().nothrow();
  if (found.exitCode !== 0) return "recent";
  return found.text().trim().length > 0 ? "recent" : "stale";
}

async function drop(path: string, label: string, { stale = true } = {}) {
  if (!existsSync(path)) return;
  const bytes = await size(path);
  if (bytes === 0) return;
  if (stale && (await lastTouched(path)) === "recent") {
    console.log(`  keep  ${human(bytes).padStart(8)}  ${label} — touched in the last ${days} days`);
    return;
  }
  console.log(`  ${clean ? "drop" : "would"}  ${human(bytes).padStart(8)}  ${label}`);
  if (clean) {
    await rm(path, { recursive: true, force: true });
    reclaimed += bytes;
  }
}

console.log(`\nBuild leftovers${clean ? "" : " (dry run — pass --clean to take them)"}:\n`);

console.log("repo");
// Xcode's derived data for the phone and the watch — schemes, module caches and, by far the
// largest part, a resolved copy of every SwiftPM dependency's binary artefacts.
await drop(join(root, "apps/frontend/ios/App/build"), "ios/App/build (Xcode derived data)");
// SourceKit-LSP's own index build of BalanceKit. No build reads it; an editor rebuilds it.
await drop(join(root, "apps/frontend/ios/BalanceKit/.build"), "ios/BalanceKit/.build (SwiftPM index)");
await drop(join(root, "apps/frontend/ios/BalanceKit/build"), "ios/BalanceKit/build");
// Fastlane packs the IPA out of `Payload/`, and leaves both behind after the upload.
await drop(join(root, "apps/frontend/ios/build/Payload"), "ios/build/Payload (packed IPA staging)");
await drop(join(root, "apps/frontend/ios/build/watch-sim"), "ios/build/watch-sim");
// The one resolved copy of the SwiftPM graph the two derived data dirs share (spm-cache.ts).
await drop(join(root, "apps/frontend/ios/SourcePackages"), "ios/SourcePackages (shared SwiftPM graph)");
// Cargo's incremental cache is rebuilt on the next `cargo build` and is worth nothing between
// branches; the rest of `target/` is pruned by cargo-sweep below, which knows what is still live.
await drop(join(root, "apps/frontend/src-tauri/target/debug/incremental"), "src-tauri incremental cache", {
  stale: false,
});

const target = join(root, "apps/frontend/src-tauri/target");
const sweep = join(home, ".cargo/bin/cargo-sweep");
if (existsSync(target) && existsSync(sweep)) {
  const before = await size(target);
  if (!clean) {
    // Only the sweep itself knows how much of a target dir is dead, so a dry run reports the size
    // it would be asked to look through rather than a saving it cannot work out.
    console.log(
      `  sweep ${human(before).padStart(8)}  src-tauri/target — cargo-sweep prunes what is older than ${days} days`,
    );
  } else {
    await $`${sweep} sweep --time ${days} ${target}`.quiet().nothrow();
    const after = await size(target);
    reclaimed += before - after;
    console.log(`  swept ${human(before - after).padStart(8)}  src-tauri/target (cargo-sweep)`);
  }
} else if (existsSync(target)) {
  console.log(
    `  note  ${human(await size(target)).padStart(8)}  src-tauri/target — \`cargo install cargo-sweep\` to prune it`,
  );
}

console.log("\nmachine");
// Xcode writes here for any build started from the IDE rather than from devkit.
await drop(join(home, "Library/Developer/Xcode/DerivedData"), "~/Library/Developer/Xcode/DerivedData");

// An archive is the only copy of a shipped build's dSYMs, so the newest few days always stay.
const archives = join(home, "Library/Developer/Xcode/Archives");
if (existsSync(archives)) {
  const dates = (await readdir(archives))
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse();
  for (const date of dates.slice(3)) await drop(join(archives, date), `Archives/${date}`, { stale: false });
}

// A simulator that has been booted once holds gigabytes of iOS itself. Erasing gives that back
// without deleting the device, so `devkit dev` still finds it by name. The ones currently booted
// are the ones being worked in, and are left alone.
const devices = join(home, "Library/Developer/CoreSimulator/Devices");
if (existsSync(devices)) {
  const listed = await $`xcrun simctl list devices -j`.quiet().nothrow().json();
  for (const runtime of Object.values(listed.devices ?? {}) as { name: string; udid: string; state: string }[][]) {
    for (const device of runtime) {
      if (device.state === "Booted") continue;
      const path = join(devices, device.udid);
      if (!existsSync(path)) continue;
      const bytes = await size(path);
      if (bytes < 512 * 1024 * 1024) continue;
      const touched = (await stat(join(path, "data")).catch(() => null))?.mtimeMs ?? 0;
      if (touched > cutoff) {
        console.log(`  keep  ${human(bytes).padStart(8)}  simulator ${device.name} — used in the last ${days} days`);
        continue;
      }
      console.log(`  ${clean ? "wipe" : "would"}  ${human(bytes).padStart(8)}  simulator ${device.name}`);
      if (clean) {
        await $`xcrun simctl erase ${device.udid}`.quiet().nothrow();
        reclaimed += bytes - (await size(path));
      }
    }
  }
}

const free = (await $`df -h ${root}`.quiet().text()).trim().split("\n")[1].split(/\s+/)[3];
console.log(`\n${clean ? `Reclaimed ${human(reclaimed)}. ` : ""}${free} free.\n`);
