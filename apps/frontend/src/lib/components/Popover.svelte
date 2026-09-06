<script lang="ts">
  import { safeArea } from "$lib/platform/safe-area";
  import { onDestroy, type Snippet } from "svelte";

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
    /** Second param is true once the panel is placed and starting its drift in — safe to focus. */
    content: Snippet<[() => void, boolean]>;
    width?: number;
    align?: "start" | "end";
  } = $props();

  const MARGIN = 12;
  const GAP = 8;

  let anchor = $state<HTMLElement>();
  let panel = $state<HTMLElement>();
  let open = $state(false);
  let position = $state<{ left: number; top: number; flipped: boolean } | null>(null);
  /** Off for the first frame and again while closing — what the fade and the drift animate on. */
  let shown = $state(false);

  let closing: ReturnType<typeof setTimeout> | undefined;

  const IN_MS = 300;
  const OUT_MS = 150;
  /** The panel drifts in from the side its anchor is on, so it reads as coming out of the trigger. */
  const OFFSET = 8;

  /**
   * Placement waits for the panel to exist so it can be measured — a trigger low on the screen
   * has no room below it, and only a measured panel knows whether it has to flip above.
   */
  $effect(() => {
    if (!open || !panel) return;
    // The wrapper is `display: contents`, which has no box of its own — measure the trigger.
    const rect = anchor?.firstElementChild?.getBoundingClientRect();
    if (!rect) return;

    const height = panel.offsetHeight;
    const safe = safeArea();
    const floor = window.innerHeight - safe.bottom - MARGIN;
    const ceiling = safe.top + MARGIN;
    const below = rect.bottom + GAP;
    const flip = below + height > floor && rect.top - GAP - height > ceiling;
    const left = align === "end" ? rect.right - width : rect.left;

    position = {
      left: Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN),
      top: flip ? rect.top - GAP - height : Math.min(below, Math.max(ceiling, floor - height)),
      flipped: flip,
    };
  });

  // The panel is placed on one frame and starts moving on the next: same frame, and there's no
  // change for the transition to animate.
  $effect(() => {
    if (!position) return;
    const frame = requestAnimationFrame(() => (shown = true));
    return () => cancelAnimationFrame(frame);
  });

  /** Closing plays the same move backwards — shorter, because a dismissal shouldn't be waited on. */
  function close() {
    if (!open) return;
    shown = false;
    clearTimeout(closing);
    closing = setTimeout(() => {
      open = false;
      position = null;
    }, OUT_MS);
  }

  onDestroy(() => clearTimeout(closing));

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
  <!--
    An invisible sheet, not a dim one: this panel is a small aside, and darkening the page for it
    said the rest of the screen had stopped mattering. It still catches the tap that dismisses.
  -->
  <!-- Marked as a layer of its own: a card that opened this must not read a press in it as a
       press outside itself. -->
  <div
    use:portal
    data-popup-layer
    class="fixed inset-0 z-60"
    role="presentation"
    onclick={close}
    onkeydown={(e) => e.key === "Escape" && close()}
  >
    <!-- Transparent until measured, so it never fades in at the top-left corner first. -->
    <div
      bind:this={panel}
      class="absolute overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-(--shadow-float)
        motion-reduce:transition-none"
      style="left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;width:{width}px;
        opacity:{shown ? 1 : 0};
        transform:translateY({shown ? '0px' : position?.flipped ? `${OFFSET}px` : `-${OFFSET}px`});
        transition:opacity {shown ? IN_MS : OUT_MS}ms ease-out, transform {shown
        ? IN_MS
        : OUT_MS}ms cubic-bezier(0.16, 1, 0.3, 1)"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && close()}
    >
      {@render content(close, shown)}
    </div>
  </div>
{/if}
