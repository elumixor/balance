/**
 * Carries the macOS download over from the deployment that is live now.
 *
 * The site hands out the Mac app and the updater manifest from `/download`, and those files are
 * made by a Tauri build on a Mac — something a Linux build container can never do. A cloud build
 * that shipped without them would replace a deployment that had them, and every installed app
 * asking `/download/latest.json` would start getting a 404.
 *
 * So a build with nothing staged in `dist/download` fetches what the current deployment is
 * serving and stages that instead. A release from a laptop still overwrites it with a fresh
 * bundle; this only ever keeps what is already out there from disappearing.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const stageDir = "dist/download";
const source = process.env.DOWNLOAD_SOURCE_URL ?? "https://balance-app-mauve.vercel.app";
const files = ["latest.json", "desktop.json", "Balance.dmg", "Balance.app.tar.gz", "Balance.app.tar.gz.sig"];

if (existsSync(join(stageDir, "latest.json"))) {
  console.log(`${stageDir} is already staged — leaving it alone`);
  process.exit(0);
}

await mkdir(stageDir, { recursive: true });

for (const file of files) {
  const url = `${source}/download/${file}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`No ${file} at ${source} (${response.status})`);
      continue;
    }
    await Bun.write(join(stageDir, file), await response.arrayBuffer());
    console.log(`Carried ${file}`);
  } catch (error) {
    // A build must not fail because the live site was unreachable for a moment: the worst case is
    // a deployment without a download, which the next release from a Mac puts back.
    console.log(`Could not carry ${file}: ${error}`);
  }
}
