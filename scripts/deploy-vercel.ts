#!/usr/bin/env bun
// Builds the deployment here and uploads the finished output, rather than handing Vercel the repo
// and waiting for it to build the same thing again. `vercel build` runs the project's own build
// command (scripts/build-vercel.ts) with the production environment pulled from the linked project.
import { $ } from "bun";

const root = new URL("..", import.meta.url).pathname;

await $`bunx vercel build --prod --yes`.cwd(root);

// The upload is the one part of a release that a flaky minute of home internet can end — the CLI
// waits on the deployment over the network and gives up when the connection does, whatever the
// deployment itself went on to do.
await retry(() => $`bunx vercel deploy --prebuilt --prod --yes`.cwd(root));

async function retry<T>(attempt: () => Promise<T>, times = 3) {
  for (let remaining = times - 1; ; remaining--) {
    try {
      return await attempt();
    } catch (error) {
      if (remaining <= 0) throw error;
      console.log(`Deploy failed, retrying (${remaining} left)`);
    }
  }
}
