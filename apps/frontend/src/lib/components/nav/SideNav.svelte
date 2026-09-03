<script lang="ts">
  import { sidePanel } from "./side-panel.svelte";

  /**
   * The left panel, on the one screen that has something to put in it. A screen hands its own
   * controls here through `SidePanelSection`; when none has, there is no panel, and the screen
   * takes the whole width under the strip.
   */
</script>

{#if sidePanel.section}
  <aside class="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 pt-4 pb-6 md:flex">
    {@render sidePanel.section()}
  </aside>
{/if}
