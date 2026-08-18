#!/usr/bin/env bun
// Ships the whole product from this machine: the web app + API to Vercel, the iOS/watch app to
// TestFlight, and the macOS app into the website's own download. Nothing is built in the cloud —
// a release is one command, and its whole log is here.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");

/** The macOS app is not deployed anywhere of its own — the web deployment serves the DMG, so it
 *  has to be built before Vercel packages the site. */
const DESKTOP = { name: "desktop", color: "\x1b[33m", script: "scripts/deploy-desktop.ts" };
const targets = [
  { name: "vercel", color: "\x1b[35m", script: "scripts/deploy-vercel.ts" },
  { name: "ios", color: "\x1b[36m", script: "scripts/deploy-ios.ts" },
];

const asked = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const known = [...targets, DESKTOP].map((target) => target.name);
const unknown = asked.filter((name) => !known.includes(name));
if (unknown.length) throw new Error(`Don't know how to deploy ${unknown.join(", ")} — pick from: ${known.join(", ")}`);

const selected = asked.length ? targets.filter((target) => asked.includes(target.name)) : targets;
const desktopAlone = asked.includes(DESKTOP.name) && !selected.length;

// Both builds compile against the generated API client and read one version, so those are settled
// once, here, before anything runs in parallel — two builds rewriting them at the same time would
// be a mystery to debug.
await $`bun scripts/sync-version.ts`.cwd(root);
await $`bunx nitro-client`.cwd(join(root, "apps/backend"));

const results = desktopAlone
  ? [await run(DESKTOP)]
  : await Promise.all(selected.map((target) => (target.name === "vercel" ? withDesktop(target) : run(target))));

const failed = results.filter((result) => result.code !== 0);
for (const { name, code } of results) console.log(code === 0 ? `✓ ${name}` : `✗ ${name} (exit ${code})`);
process.exit(failed.length ? 1 : 0);

/** The site carries the macOS app, so a web deploy builds it first and inherits its failure. */
async function withDesktop(target: (typeof targets)[number]) {
  const desktop = await run(DESKTOP);
  if (desktop.code !== 0) return { name: target.name, code: desktop.code };
  return run(target);
}

/** Runs one deploy script, tagging every line it prints so several logs can share one terminal. */
function run({ name, color, script }: typeof DESKTOP) {
  return new Promise<{ name: string; code: number }>((done) => {
    const label = `${color}[${name}]\x1b[0m`;
    const child = spawn("bun", [script], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SKIP_CLIENT_GEN: "1" },
    });

    for (const stream of [child.stdout, child.stderr]) {
      let rest = "";
      stream.on("data", (chunk: Buffer) => {
        const lines = (rest + chunk.toString()).split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) console.log(`${label} ${line}`);
      });
      stream.on("end", () => rest && console.log(`${label} ${rest}`));
    }

    child.on("close", (code) => done({ name, code: code ?? 1 }));
  });
}
