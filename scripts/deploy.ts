#!/usr/bin/env bun
// Ships both halves of the product from this machine, at the same time: the web app + API to
// Vercel, and the iOS/watch app to TestFlight. Nothing is built in the cloud — a release is one
// command, and its whole log is here.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");

const targets = [
  { name: "vercel", color: "\x1b[35m", script: "scripts/deploy-vercel.ts" },
  { name: "ios", color: "\x1b[36m", script: "scripts/deploy-ios.ts" },
];

const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const selected = only.length ? targets.filter((target) => only.includes(target.name)) : targets;
if (!selected.length) throw new Error(`Nothing to deploy — pick from: ${targets.map((t) => t.name).join(", ")}`);

// Both builds compile against the generated API client, so it is written once, here, before
// anything runs in parallel — a build reading it while the other rewrites it would be a mystery.
await $`bunx nitro-client`.cwd(join(root, "apps/backend"));

const results = await Promise.all(selected.map(run));
const failed = results.filter((result) => result.code !== 0);

for (const { name, code } of results) console.log(code === 0 ? `✓ ${name}` : `✗ ${name} (exit ${code})`);
process.exit(failed.length ? 1 : 0);

/** Runs one deploy script, tagging every line it prints so two logs can share one terminal. */
function run({ name, color, script }: (typeof targets)[number]) {
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
