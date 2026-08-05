<script lang="ts">
  import type { Snippet } from "svelte";
  import BrandMark from "./BrandMark.svelte";

  let { tagline, children }: { tagline: string; children: Snippet } = $props();
</script>

<div class="flex min-h-dvh flex-col justify-center gap-6 bg-bg px-5 py-10">
  <div class="space-y-4">
    <BrandMark />
    <div class="space-y-1">
      <h1 class="t-title">Balance</h1>
      <p class="t-body text-fg-muted">{tagline}</p>
    </div>
  </div>
  {@render children()}
</div>
