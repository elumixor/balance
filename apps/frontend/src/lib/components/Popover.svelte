<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * An anchored panel for inline choices (theme, colour, account). Replaces the
   * dialogs the app used to open for one-tap decisions.
   */
  let {
    trigger,
    content,
    width = 220,
    align = "end",
  }: {
    trigger: Snippet<[() => void, boolean]>;
    content: Snippet<[() => void]>;
    width?: number;
    align?: "start" | "end";
  } = $props();

  let anchor = $state<HTMLElement>();
  let position = $state<{ left: number; top: number } | null>(null);

  function open() {
    const rect = anchor?.getBoundingClientRect();
    if (!rect) return;
    const left = align === "end" ? rect.right - width : rect.left;
    position = {
      left: Math.min(Math.max(12, left), window.innerWidth - width - 12),
      top: Math.min(rect.bottom + 8, window.innerHeight - 80),
    };
  }

  const close = () => (position = null);
</script>

<div bind:this={anchor} class="contents">
  {@render trigger(open, position !== null)}
</div>

{#if position}
  <!-- The backdrop closes the panel on any tap outside it; Escape does the same for keyboards. -->
  <div
    class="fixed inset-0 z-50"
    style="background:var(--overlay)"
    role="presentation"
    onclick={close}
    onkeydown={(e) => e.key === "Escape" && close()}
  >
    <div
      class="absolute overflow-hidden rounded-lg border border-line bg-surface py-1"
      style="left:{position.left}px;top:{position.top}px;width:{width}px"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && close()}
    >
      {@render content(close)}
    </div>
  </div>
{/if}
