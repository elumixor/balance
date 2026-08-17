#!/usr/bin/env bun
// Builds the deployment here and uploads the finished output, rather than handing Vercel the repo
// and waiting for it to build the same thing again. `vercel build` runs the project's own build
// command (scripts/build-vercel.ts) with the production environment pulled from the linked project.
import { $ } from "bun";

const root = new URL("..", import.meta.url).pathname;

await $`bunx vercel build --prod --yes`.cwd(root);
await $`bunx vercel deploy --prebuilt --prod --yes`.cwd(root);
