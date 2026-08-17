<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { watchDesktopFocus } from "$lib/desktop/focus-sync";
  import { watchDesktopSignIn } from "$lib/desktop/sign-in";
  import { theme } from "$lib/theme.svelte";
  import { viewport } from "$lib/viewport.svelte";
  import type { Snippet } from "svelte";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  theme.start();
  viewport.start();
  // Failures surface through `auth.startupError`; this only keeps the rejection handled.
  auth.load().catch(() => {});
  // Above the routes, because a `balance-desktop://` ticket can land on any of them — including the
  // sign-in screen the app happens to be showing when the browser finishes.
  $effect(watchDesktopSignIn);
  // Same reasoning, different signal: the window never remounts, so it can't rely on a screen
  // revisit to notice a calendar connected elsewhere while it sat in the background.
  $effect(watchDesktopFocus);
</script>

{@render children()}
