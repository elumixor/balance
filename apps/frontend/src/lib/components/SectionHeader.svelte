<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, trailing }: { title: string; trailing?: Snippet } = $props();
</script>

<div class="mb-2 flex min-h-8 items-center justify-between">
  <span class="t-label text-fg-muted">{title}</span>
  {#if trailing}{@render trailing()}{/if}
</div>
