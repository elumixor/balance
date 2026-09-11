<script lang="ts">
  import { shellSlots } from "$lib/nav/shell-slots.svelte";
  import type { Snippet } from "svelte";

  /**
   * Renders nothing here: whatever a screen wraps in this shows up on the shell — under the rail's
   * nav list, or on the strip's own line beside the icons. The cleanup only clears the slot if it
   * still holds this screen's snippet, so a navigation that mounts the next screen before tearing
   * down this one doesn't blank what the new screen has just put there.
   */
  let { slot, children }: { slot: "panel" | "where"; children: Snippet } = $props();

  $effect(() => {
    shellSlots[slot] = children;
    return () => {
      if (shellSlots[slot] === children) shellSlots[slot] = null;
    };
  });
</script>
