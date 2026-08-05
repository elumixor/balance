<script lang="ts">
  import type { Snippet } from "svelte";

  /** The screen title lives in the content, not in a nav bar, so it scrolls away. */
  let { title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: Snippet } = $props();
</script>

<div class="mb-4 flex items-start justify-between gap-3">
  <div class="flex-1 space-y-0.5">
    <h1 class="t-title">{title}</h1>
    {#if subtitle}
      <p class="t-label text-fg-muted">{subtitle}</p>
    {/if}
  </div>
  {#if trailing}{@render trailing()}{/if}
</div>
