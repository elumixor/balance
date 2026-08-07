<script lang="ts">
  import type { Snippet } from "svelte";
  import { sidePanel } from "./side-panel.svelte";

  /**
   * Renders nothing here: whatever a screen wraps in this shows up under the rail's nav list.
   * The cleanup only clears the slot if it still holds this screen's snippet, so a navigation
   * that mounts the next screen before tearing down this one doesn't blank the new panel.
   */
  let { children }: { children: Snippet } = $props();

  $effect(() => {
    sidePanel.section = children;
    return () => {
      if (sidePanel.section === children) sidePanel.section = null;
    };
  });
</script>
