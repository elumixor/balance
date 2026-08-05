<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { theme } from "$lib/theme.svelte";
  import type { Snippet } from "svelte";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  theme.start();
  void auth.load();
</script>

{@render children()}
