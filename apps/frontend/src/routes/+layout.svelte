<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { ProblemToasts } from "./components";
  import { diagnostics } from "$lib/diagnostics.svelte";
  import { watchDesktopFocus } from "$lib/desktop/focus-sync";
  import { watchDesktopSignIn } from "$lib/desktop/sign-in";
  import { page } from "$app/state";
  import { telemetry } from "$lib/telemetry";
  import { theme } from "$lib/theme.svelte";
  import { viewport } from "$lib/viewport.svelte";
  import { watchdog } from "$lib/watchdog.svelte";
  import type { Snippet } from "svelte";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  // Before anything else can fail — including `diagnostics` itself, which reports into it: a
  // rejection thrown while the app is still starting is exactly the one nobody sees otherwise.
  telemetry.start();
  diagnostics.start();
  watchdog.start();
  theme.start();
  viewport.start();
  // Failures also surface through `auth.startupError`, which the splash reads; this keeps the
  // rejection handled and puts it where a screen that isn't the splash can show it too.
  auth.load().catch((e) => diagnostics.report("Sign-in", e, { title: "Couldn’t sign you in", retry: () => auth.load() }));
  // Above the routes, because a `balance-desktop://` ticket can land on any of them — including the
  // sign-in screen the app happens to be showing when the browser finishes.
  $effect(watchDesktopSignIn);
  // Same reasoning, different signal: the window never remounts, so it can't rely on a screen
  // revisit to notice a calendar connected elsewhere while it sat in the background.
  $effect(watchDesktopFocus);
  // One URL is a week, a day and a plan in turn, so a screen is counted when it is opened rather
  // than left to a router that sees the same address throughout.
  $effect(() => telemetry.screen(page.url.pathname));

  // The heartbeat itself. Reading the counter is what makes this run again, and running is the
  // whole message — see `watchdog.svelte.ts`, which is watching for it to stop.
  $effect(() => {
    void watchdog.ping;
    watchdog.beat();
  });
</script>

{@render children()}

<!-- Above every screen, and outside the app shell, so a failure on the way to a session is shown
     in the same corner as one on the calendar. -->
<ProblemToasts />
