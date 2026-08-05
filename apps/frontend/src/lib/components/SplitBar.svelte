<script lang="ts">
  import type { Split } from "$lib/types";

  /**
   * The same stacked bar shows an activity's category mix everywhere it appears —
   * in the activity list, on a quick-start tile and as the spine of a logged entry.
   */
  let {
    splits,
    thickness = 4,
    vertical = false,
    class: klass = "",
  }: { splits: Split[]; thickness?: number; vertical?: boolean; class?: string } = $props();

  const visible = $derived(splits.filter((s) => s.value > 0));
  const cross = $derived(vertical ? `width:${thickness}px` : `height:${thickness}px;width:100%`);
</script>

{#if visible.length === 0}
  <div class="rounded-sm bg-line {klass}" style={cross}></div>
{:else}
  <div class="flex gap-px overflow-hidden rounded-sm {vertical ? 'flex-col' : 'flex-row'} {klass}" style={cross}>
    {#each visible as split (split.id)}
      <div style="flex-grow:{split.value};flex-basis:0;background:{split.color}"></div>
    {/each}
  </div>
{/if}
