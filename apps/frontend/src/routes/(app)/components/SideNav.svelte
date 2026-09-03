<script lang="ts">
  import { sidePanel } from "$lib/nav/side-panel.svelte";

  /**
   * The left panel, on the one screen that has something to put in it (the calendar). Its top is
   * left empty for the strip, which floats over the same corner whether or not there is a panel
   * under it — see `NavStrip`.
   */
</script>

{#if sidePanel.section}
  <aside class="hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r border-line bg-surface pt-[52px] md:flex">
    <!-- The panel scrolls, the top doesn't: the strip sits on solid surface rather than on
         whatever row has been scrolled up under it. -->
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      {@render sidePanel.section()}
    </div>
  </aside>
{/if}
