<script lang="ts">
  import type { Snippet } from "svelte";

  /** A bordered container. Used for grouped rows, never for every single item. */
  let {
    children,
    padded = true,
    class: klass = "",
  }: { children: Snippet; padded?: boolean; class?: string } = $props();
</script>

<div class="overflow-hidden rounded-lg border border-line bg-surface {padded ? 'p-4' : ''} {klass}">
  {@render children()}
</div>
