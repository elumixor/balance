<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";

  /**
   * A hover label for a control that shows only an icon, and — where there is one — the key that
   * does the same thing. The rail is icons now, so this is what carries their names.
   *
   * Fixed rather than absolute: the rail clips its own overflow, and a label that has to fit
   * inside the thing it describes isn't a label.
   */
  let {
    label,
    hotkey,
    children,
  }: { label: string; hotkey?: string; children: Snippet } = $props();

  /** Long enough that crossing the strip on the way somewhere else doesn't light every icon up. */
  const DELAY_MS = 400;
  const GAP = 8;
  const MARGIN = 8;

  let anchor = $state<HTMLElement>();
  let bubble = $state<HTMLElement>();
  let shown = $state(false);
  let position = $state<{ left: number; top: number } | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show() {
    // The wrapper is `display: contents`, which has no box of its own — measure the control.
    const rect = anchor?.firstElementChild?.getBoundingClientRect();
    if (!rect) return;
    position = { left: rect.left + rect.width / 2, top: rect.bottom + GAP };
    shown = true;
  }

  /**
   * Centred under its control until that would put it through the side of the window — the first
   * icon in the rail sits close enough to the left edge that half a label doesn't fit beside it.
   * Measured rather than guessed: the width is whatever the label and its key add up to.
   */
  $effect(() => {
    if (!shown || !bubble || !position) return;
    const half = bubble.offsetWidth / 2;
    const left = Math.min(Math.max(position.left, MARGIN + half), window.innerWidth - MARGIN - half);
    if (left !== position.left) position = { ...position, left };
  });

  function open() {
    timer ??= setTimeout(show, DELAY_MS);
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
    bind:this={bubble}
    role="tooltip"
    transition:fade={{ duration: 90 }}
    style="left:{position.left}px;top:{position.top}px"
    class="pointer-events-none fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-line
      bg-surface px-2 py-1 shadow-float"
  >
    <span class="t-micro whitespace-nowrap text-fg">{label}</span>
    {#if hotkey}
      <kbd class="t-micro rounded-sm border border-line bg-surface-alt px-1 text-fg-muted uppercase">{hotkey}</kbd>
    {/if}
  </div>
{/if}
