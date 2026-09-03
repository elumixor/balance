/**
 * Installs (or removes, with `--uninstall`) the launchd job that runs `space.ts --clean` weekly.
 *
 * A cleanup that has to be remembered is a cleanup that happens once, on the morning the disk
 * fills up. This runs on Sundays at 11:00, or at the next login if the machine was asleep then,
 * and takes only what `space.ts` already considers stale — so a week spent in the Xcode project
 * never has its derived data pulled out from under it.
 *
 *   bun scripts/install-space-agent.ts
 *   bun scripts/install-space-agent.ts --uninstall
 */

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const label = "com.elumixor.balance.space";
const root = resolve(import.meta.dir, "..");
const agents = join(homedir(), "Library/LaunchAgents");
const plist = join(agents, `${label}.plist`);
const log = join(homedir(), "Library/Logs", `${label}.log`);

if (process.argv.includes("--uninstall")) {
  await $`launchctl bootout gui/${process.getuid?.()}/${label}`.quiet().nothrow();
  if (existsSync(plist)) await rm(plist);
  console.log(`Removed ${label}`);
  process.exit(0);
}

const bun = Bun.which("bun") ?? process.execPath;

await mkdir(agents, { recursive: true });
await writeFile(
  plist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bun}</string>
    <string>${join(root, "scripts/space.ts")}</string>
    <string>--clean</string>
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>11</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`,
);

const domain = `gui/${process.getuid?.()}`;
await $`launchctl bootout ${domain}/${label}`.quiet().nothrow();
await $`launchctl bootstrap ${domain} ${plist}`.nothrow();
console.log(`Installed ${label} — Sundays at 11:00, logging to ${log}`);
