<script lang="ts">
  import type { Snippet } from "svelte";
  import TooltipAnchor from "./TooltipAnchor.svelte";

  /**
   * A hover label for a control that shows only an icon, and — where there is one — the key that
   * does the same thing. The rail is icons now, so this is what carries their names.
   */
  let {
    label,
    hotkey,
    instant = false,
    children,
  }: { label: string; hotkey?: string; instant?: boolean; children: Snippet } = $props();
</script>

<TooltipAnchor {instant}>
  {@render children()}
  {#snippet bubble()}
    <div
      class="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 shadow-float"
    >
      <span class="t-micro whitespace-nowrap text-fg">{label}</span>
      {#if hotkey}
        <kbd class="t-micro rounded-sm border border-line bg-surface-alt px-1 text-fg-muted uppercase">{hotkey}</kbd>
      {/if}
    </div>
  {/snippet}
</TooltipAnchor>
