<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    hint,
    children,
    class: klass = "",
  }: { label: string; hint?: string; children: Snippet; class?: string } = $props();
</script>

<div class="space-y-1.5 {klass}">
  <span class="t-label block text-fg-muted">{label}</span>
  {@render children()}
  {#if hint}
    <span class="t-micro block text-fg-faint">{hint}</span>
  {/if}
</div>
