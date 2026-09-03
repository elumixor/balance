<script lang="ts">
  import { isDesktop } from "$lib/desktop/platform";
  import NavStrip from "./NavStrip.svelte";
  import { sidePanel } from "./side-panel.svelte";

  /**
   * The wide-screen navigation, in one of two shapes. A screen with a section of its own (the
   * calendar) gets a rail: the strip on top, the section under it. Every other screen gets the
   * strip alone, floating in the same corner over the screen's top padding, so the ring and the
   * projects keep the whole window and the icons never move.
   */
</script>

{#if sidePanel.section}
  <!-- `select-none`: none of this is text anyone means to copy, and a drag across it should move
       the window rather than paint a selection over it. -->
  <nav
    class="hidden h-full w-60 shrink-0 select-none flex-col overflow-hidden border-r border-line bg-surface px-3 pb-6 md:flex {isDesktop
      ? 'pt-0'
      : 'pt-3'}"
  >
    <div class="mb-4"><NavStrip /></div>
    <!-- The one part of the rail that scrolls. The strip is the rail's fixed point — scrolling it
         away would take the window buttons' backdrop with it — so the overflow lives here, on the
         screen's own section, and clips to whatever room is left. -->
    <div class="min-h-0 flex-1 overflow-y-auto pt-4">
      {@render sidePanel.section()}
    </div>
  </nav>
{:else}
  <nav class="absolute top-0 left-0 z-30 hidden w-60 px-3 md:block {isDesktop ? 'pt-0' : 'pt-3'}">
    <NavStrip />
  </nav>
{/if}
