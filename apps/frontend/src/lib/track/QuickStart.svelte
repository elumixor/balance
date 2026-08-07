<script lang="ts">
  import SplitBar from "$lib/components/SplitBar.svelte";
  import type { StartTile } from "./track-data.svelte";

  /**
   * Starting a timer is the app's most-used action, so it gets tiles rather than a
   * list — and each tile carries the activity's category mix, which is the thing
   * you're really choosing between.
   */
  let {
    tiles,
    onstart,
    startingId,
  }: { tiles: StartTile[]; onstart: (id: string) => void; startingId: string | null } = $props();
</script>

<!-- Two across, always: the tiles stay thumb-sized rather than stretching into banners. -->
<div class="grid grid-cols-2 gap-2">
  {#each tiles as tile (tile.id)}
    <button
      type="button"
      onclick={() => onstart(tile.id)}
      disabled={startingId !== null}
      aria-label="Start {tile.name}"
      class="press flex flex-col justify-between gap-2 rounded-lg border bg-surface p-3 text-left
        hover:border-line-strong {startingId === tile.id ? 'border-line-strong' : 'border-line'}"
    >
      <span class="t-body-strong">{tile.name}</span>
      <SplitBar splits={tile.splits} thickness={5} />
    </button>
  {/each}
</div>
