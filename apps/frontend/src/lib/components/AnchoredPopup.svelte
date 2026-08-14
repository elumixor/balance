<script lang="ts">
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

  /** The card stays hidden — and unanimated — until it knows where it belongs. */
  const placed = $derived(Boolean(position) || !rect);

  function onpointerdown(e: PointerEvent) {
    if (!dismiss || !card || card.contains(e.target as Node)) return;
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (dismiss && e.key === "Escape") onclose();
  }
</script>

<svelte:window {onkeydown} {onpointerdown} />

<!--
  On a phone the card is a sheet, and the backdrop behind it dims the week and takes the tap that
  closes it. On a wide screen there is no backdrop to speak of — whatever's underneath stays live,
  so the next block you press opens straight away instead of costing a click on this one.
-->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  class="fade-in fixed inset-0 z-40 flex items-end justify-center bg-overlay sm:pointer-events-none sm:block
    sm:bg-transparent"
  onclick={() => dismiss && onclose()}
>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    bind:this={card}
    class="max-h-[85dvh] w-full overflow-y-auto rounded-t-lg border border-line bg-surface
      shadow-(--shadow-float) sm:pointer-events-auto sm:absolute sm:w-[var(--popup-w)] sm:rounded-lg
      {placed ? 'float-in' : ''}"
    style="--popup-w:{width}px;left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;visibility:{placed
      ? 'visible'
      : 'hidden'}"
    onclick={(e) => e.stopPropagation()}
  >
    {@render children()}
  </div>
</div>
