<script lang="ts">
  import { sidePanel } from "./side-panel.svelte";

  /**
   * The left panel, on the one screen that has something to put in it (the calendar). Its top is
   * left empty for the strip, which floats over the same corner whether or not there is a panel
   * under it — see `NavStrip`.
   */
</script>

{#if sidePanel.section}
  <aside
    class="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 pt-[52px] pb-6 md:flex"
  >
    {@render sidePanel.section()}
  </aside>
{/if}
