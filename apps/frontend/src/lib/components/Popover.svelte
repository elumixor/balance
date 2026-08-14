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

  const MARGIN = 12;
  const GAP = 8;

  let anchor = $state<HTMLElement>();
  let panel = $state<HTMLElement>();
  let open = $state(false);
  let position = $state<{ left: number; top: number } | null>(null);

  /**
   * Placement waits for the panel to exist so it can be measured: the account menu sits at the
   * foot of the side rail, where the only room left is upward.
   */
  $effect(() => {
    if (!open || !panel) return;
    // The wrapper is `display: contents`, which has no box of its own — measure the trigger.
    const rect = anchor?.firstElementChild?.getBoundingClientRect();
    if (!rect) return;

    const height = panel.offsetHeight;
    const below = rect.bottom + GAP;
    const flip = below + height > window.innerHeight - MARGIN && rect.top - GAP - height > MARGIN;
    const left = align === "end" ? rect.right - width : rect.left;

    position = {
      left: Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN),
      top: flip ? rect.top - GAP - height : Math.min(below, Math.max(MARGIN, window.innerHeight - MARGIN - height)),
    };
  });

  function close() {
    open = false;
    position = null;
  }

  /**
   * The panel has to leave the tree it was declared in. A list row carries the stagger animation,
   * and an element with an animated transform is a containing block for `position: fixed` — so
   * the backdrop stopped at the row's edges, greying that one row and hiding the panel with it.
   */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy: () => node.remove(),
    };
  }
</script>

<div bind:this={anchor} class="contents">
  {@render trigger(() => (open = true), open)}
</div>

{#if open}
  <!-- The backdrop closes the panel on any tap outside it; Escape does the same for keyboards. -->
  <div
    use:portal
    class="fixed inset-0 z-50"
    style="background:var(--overlay)"
    role="presentation"
    onclick={close}
    onkeydown={(e) => e.key === "Escape" && close()}
  >
    <!-- Hidden until measured, so it never flashes at the top-left corner first. -->
    <div
      bind:this={panel}
      class="absolute overflow-hidden rounded-lg border border-line bg-surface py-1"
      style="left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;width:{width}px;visibility:{position
        ? 'visible'
        : 'hidden'}"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && close()}
    >
      {@render content(close)}
    </div>
  </div>
{/if}
