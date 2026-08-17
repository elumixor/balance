<script lang="ts">
  import type { Snippet } from "svelte";
  import { fly } from "svelte/transition";

  /**
   * The positioning and timing a hover label needs, without an opinion on what it shows — `Tooltip`
   * is this plus a label-and-key bubble; a richer one composes this directly with its own bubble.
   *
   * Fixed rather than absolute: a caller that clips its own overflow (the rail, a row of rings)
   * shouldn't also clip the label describing what's in it.
   */
  let {
    instant = false,
    gap = 8,
    margin = 8,
    children,
    bubble,
  }: {
    /** Skips the hover delay — for a row of things that all want reading at a glance. */
    instant?: boolean;
    gap?: number;
    margin?: number;
    children: Snippet;
    bubble: Snippet;
  } = $props();

  /** Long enough that crossing past something on the way elsewhere doesn't light it up. */
  const delayMs = $derived(instant ? 0 : 400);

  let anchor = $state<HTMLElement>();
  let bubbleEl = $state<HTMLElement>();
  let shown = $state(false);
  let position = $state<{ left: number; top: number } | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show() {
    // The wrapper is `display: contents`, which has no box of its own — measure the control.
    const rect = anchor?.firstElementChild?.getBoundingClientRect();
    if (!rect) return;
    position = { left: rect.left + rect.width / 2, top: rect.bottom + gap };
    shown = true;
  }

  /** Centred under its control until that would put it through the side of the window. */
  $effect(() => {
    if (!shown || !bubbleEl || !position) return;
    const half = bubbleEl.offsetWidth / 2;
    const left = Math.min(Math.max(position.left, margin + half), window.innerWidth - margin - half);
    if (left !== position.left) position = { ...position, left };
  });

  function open() {
    timer ??= setTimeout(show, delayMs);
  }

  function close() {
    if (timer) clearTimeout(timer);
    timer = null;
    shown = false;
  }
</script>

<!-- Focus counts as hover: a control reached by keyboard needs its name as much as one under a
     cursor, and pointerdown dismisses so the label never sits on top of what it just opened. -->
<span
  bind:this={anchor}
  role="presentation"
  class="contents"
  onpointerenter={open}
  onpointerleave={close}
  onpointerdown={close}
  onfocusin={show}
  onfocusout={close}
>
  {@render children()}
</span>

{#if shown && position}
  <div
    bind:this={bubbleEl}
    role="tooltip"
    transition:fly={{ y: 4, duration: 110 }}
    style="left:{position.left}px;top:{position.top}px"
    class="pointer-events-none fixed z-50 -translate-x-1/2"
  >
    {@render bubble()}
  </div>
{/if}
