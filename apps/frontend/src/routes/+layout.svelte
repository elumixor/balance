<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import ProblemBanner from "$lib/components/ProblemBanner.svelte";
  import { diagnostics } from "$lib/diagnostics.svelte";
  import { watchDesktopFocus } from "$lib/desktop/focus-sync";
  import { watchDesktopSignIn } from "$lib/desktop/sign-in";
  import { theme } from "$lib/theme.svelte";
  import { viewport } from "$lib/viewport.svelte";
  import type { Snippet } from "svelte";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  // Before anything else can fail: a rejection thrown while the app is still starting is exactly
  // the one nobody sees otherwise.
  diagnostics.start();
  theme.start();
  viewport.start();
  // Failures also surface through `auth.startupError`, which the splash reads; this keeps the
  // rejection handled and puts it where a screen that isn't the splash can show it too.
  auth.load().catch((e) => diagnostics.report("Sign-in", e));
  // Above the routes, because a `balance-desktop://` ticket can land on any of them — including the
  // sign-in screen the app happens to be showing when the browser finishes.
  $effect(watchDesktopSignIn);
  // Same reasoning, different signal: the window never remounts, so it can't rely on a screen
  // revisit to notice a calendar connected elsewhere while it sat in the background.
  $effect(watchDesktopFocus);
</script>

{@render children()}

<!-- Above every screen, and outside the app shell, so a failure on the way to a session is shown
     by the same strip as one on the calendar. -->
<ProblemBanner />
