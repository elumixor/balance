<script lang="ts">
  import { keyboard } from "$lib/platform/keyboard.svelte";
  import { viewport } from "$lib/platform/viewport.svelte";
  import type { Snippet } from "svelte";

  /**
   * A card anchored beside a rect on wide screens, a bottom sheet on a phone. Shared shell for
   * every "tap a block, get its details" popup — the full event editor and the quick category
   * pick both float in the same way, so only their content differs.
   */
  let {
    rect,
    width = 380,
    /**
     * Whether a press outside or an Escape closes this card. A card that opened a second popup of
     * its own turns it off: the press that lands in the child is outside the parent, and would
     * otherwise take both cards down at once.
     */
    dismiss = true,
    onclose,
    children,
  }: {
    rect: DOMRect | null;
    width?: number;
    dismiss?: boolean;
    onclose: () => void;
    children: Snippet;
  } = $props();

  const MARGIN = 12;
  const GAP = 8;

  let card = $state<HTMLElement>();
  let position = $state<{ left: number; top: number } | null>(null);

  /** Beside the rect if there's room on either side of it, otherwise clamped into the viewport. */
  function place() {
    if (!card || !rect) return;
    const height = card.offsetHeight;
    const right = rect.right + GAP;
    const left = right + width <= window.innerWidth - MARGIN ? right : rect.left - GAP - width;

    position = {
      left: Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN),
      top: Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, window.innerHeight - MARGIN - height)),
    };
  }

  // Re-placed whenever the card's own content changes its height, whatever that content is.
  $effect(() => {
    if (!card || !rect) return;
    place();
    const observer = new ResizeObserver(place);
    observer.observe(card);
    return () => observer.disconnect();
  });

  /**
   * How far the sheet sits off the bottom of the window: the keyboard, or the wheel a date field
   * puts up. A wide-screen card is placed against its block and never moves for either.
   */
  const lift = $derived(viewport.sm ? 0 : keyboard.inset);

  /** The card stays hidden — and unanimated — until it knows where it belongs. */
  const placed = $derived(Boolean(position) || !rect);

  function onpointerdown(e: PointerEvent) {
    if (!dismiss || !card || card.contains(e.target as Node)) return;
    // A menu one of the card's own fields opened lives at the top of the document rather than
    // inside the card, so it can't be clipped or mispositioned — pressing it isn't pressing away.
    if ((e.target as Element | null)?.closest?.("[data-popup-layer]")) return;
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (dismiss && e.key === "Escape") onclose();
  }

  /**
   * This panel has to leave the tree it was declared in. A list row carries the stagger
   * animation, and an element with an animated transform is a containing block for
   * `position: fixed` — left inline, the popup would be pinned to that row's box instead of
   * the viewport.
   */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy: () => node.remove(),
    };
  }
</script>

<!--
  Capture phase, not bubble: a nested popup's own card stops pointerdown from bubbling (see below),
  which would otherwise stop a press inside the parent card — but outside this one — from ever
  reaching this listener.
-->
<svelte:window {onkeydown} onpointerdowncapture={onpointerdown} />

<!--
  On a phone the card is a sheet, and the backdrop behind it dims the week and takes the tap that
  closes it. On a wide screen there is no backdrop to speak of — whatever's underneath stays live,
  so the next block you press opens straight away instead of costing a click on this one.
-->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  use:portal
  class="fade-in fixed inset-0 z-40 flex items-end justify-center bg-overlay sm:pointer-events-none sm:block
    sm:bg-transparent"
  style="padding-bottom:{lift}px"
  onclick={() => dismiss && onclose()}
>
  <!--
    Presses inside the card go no further: the card is rendered where whatever opened it lives, and
    on the calendar that's inside a block that starts a drag — and swallows the press's default —
    on pointerdown. Without this a field in here could never take focus.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <!-- The sheet rises from the edge it sits on and keeps its last rows above the home indicator;
       the wide-screen card drifts in beside its block instead. -->
  <div
    bind:this={card}
    class="max-h-[calc(100dvh-var(--safe-top)-24px-var(--lift))] w-full touch-auto select-text overflow-y-auto rounded-t-2xl
      border border-line bg-surface shadow-(--shadow-float) max-sm:safe-bottom sm:pointer-events-auto sm:absolute
      sm:max-h-[85dvh] sm:w-[var(--popup-w)] sm:rounded-lg {placed ? 'max-sm:sheet-in sm:float-in' : ''}"
    style="--lift:{lift}px;--popup-w:{width}px;left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;visibility:{placed
      ? 'visible'
      : 'hidden'}"
    onclick={(e) => e.stopPropagation()}
    onpointerdown={(e) => e.stopPropagation()}
  >
    <div class="sheet-handle sm:hidden"></div>
    {@render children()}
  </div>
</div>
