<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { theme } from "$lib/theme.svelte";
  import type { Snippet } from "svelte";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  theme.start();
  // Failures surface through `auth.startupError`; this only keeps the rejection handled.
  auth.load().catch(() => {});
</script>

{@render children()}
