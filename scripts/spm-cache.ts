/**
 * Points every Xcode derived data directory at one shared copy of the SwiftPM dependencies.
 *
 * The phone and the watch are separate schemes with separate derived data (`ios/App/build/iphone`
 * and `.../sim`), and each one resolves the project's package graph into a `SourcePackages`
 * directory of its own. That graph is mostly prebuilt binaries — Sentry's XCFramework ships every
 * slice and its dSYMs at ~3 GB, the Facebook SDK that arrives under the social-login plugin adds
 * a quarter of that — so the second copy costs ~4 GB and holds byte-for-byte what the first one
 * already has.
 *
 * A symlink is how `xcodebuild -clonedSourcePackagesDirPath` would do it, minus the flag devkit
 * has no way to pass. SwiftPM locks the directory while it resolves, so the one case this creates
 * — `devkit dev` compiling both schemes at once — waits rather than races.
 *
 * Runs on `bun install` and again after `bun run space:clean`, because a derived data directory
 * that has been deleted comes back as a plain one otherwise.
 */

import { existsSync, lstatSync } from "node:fs";
import { mkdir, rename, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const iosDir = join(root, "apps/frontend/ios");
const shared = join(iosDir, "SourcePackages");
const derived = ["App/build/iphone", "App/build/sim"].map((path) => join(iosDir, path, "SourcePackages"));

if (!existsSync(join(iosDir, "App"))) process.exit(0);

// Relative, so the link survives the checkout moving to another directory.
const target = (path: string) => relative(dirname(path), shared);

for (const path of derived) {
  const link = lstatSync(path, { throwIfNoEntry: false });
  if (link?.isSymbolicLink()) {
    if (existsSync(path)) continue;
    // A link left pointing at where the checkout used to be.
    await rm(path);
  }

  await mkdir(join(path, ".."), { recursive: true });
  // The first real directory found becomes the shared one, so nothing has to be re-downloaded.
  if (existsSync(path)) {
    if (existsSync(shared)) await rm(path, { recursive: true, force: true });
    else await rename(path, shared);
  }
  await mkdir(shared, { recursive: true });
  await symlink(target(path), path);
  console.log(`SourcePackages: ${path.slice(root.length + 1)} -> ios/SourcePackages`);
}
