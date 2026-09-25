<script lang="ts">
  import { Avatars } from "$lib/components";
  import { type DragMode, placeOf, type Scale, type Span } from "$lib/projects/gantt";
  import type { TimelineDrag } from "$lib/projects/timeline.svelte";
  import type { Person } from "$lib/people/types";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";

  /**
   * One run of days on the grid — a task, or the band of a stage. It is dragged by its middle and
   * resized by either edge, and what it draws while a pointer is on it is the drag rather than the
   * record, so a week moved across a month is one write when the pointer is let go.
   *
   * An edge that falls outside the window can't be resized there, so it wears a chevron instead:
   * the row says the work runs on, and pressing it scrolls to the end that is missing.
   */
  let {
    id,
    span,
    window: bounds,
    scale,
    drag,
    color,
    /** How much of the colour a bar shows — depth reads as weight. */
    tone = 1,
    label,
    people = [],
    faded = false,
    band = false,
    selected = false,
    movable = true,
    resizable = true,
    onselect,
    oncommit,
    onjump,
    trailing,
  }: {
    id: string;
    span: Span;
    window: Span;
    scale: Scale;
    drag: TimelineDrag;
    color: string;
    tone?: number;
    label: string;
    people?: readonly Person[];
    faded?: boolean;
    band?: boolean;
    selected?: boolean;
    movable?: boolean;
    resizable?: boolean;
    onselect?: () => void;
    oncommit: (span: Span) => void;
    onjump?: (day: string) => void;
    trailing?: import("svelte").Snippet;
  } = $props();

  /** Below this a bar is a sliver, and its handles would cover the whole of it. */
  const HANDLES_FROM_PX = 34;

  const shown = $derived(drag.spanOf(id, span) ?? span);
  const place = $derived(placeOf(shown, bounds, scale));
  const handles = $derived(movable && resizable && place.width >= HANDLES_FROM_PX);

  function begin(event: PointerEvent, mode: DragMode) {
    if (movable) drag.begin(event, { id, span, mode, scale, commit: oncommit });
  }

  function click() {
    if (!drag.moved) onselect?.();
  }
</script>

<div
  class="absolute inset-y-0.5 touch-none rounded-sm
    {band ? 'border border-line-strong bg-surface-alt' : ''}
    {selected ? 'ring-2 ring-fg/30' : ''}"
  style="left:{place.left}px;width:{place.width}px{band
    ? ''
    : `;background:color-mix(in oklab,${color} ${Math.round(tone * 100)}%,transparent)`}"
>
  <button
    type="button"
    onpointerdown={(event) => begin(event, "move")}
    onclick={click}
    class="flex h-full w-full items-center gap-1.5 px-2 text-left
      {movable ? 'cursor-grab active:cursor-grabbing' : ''}"
  >
    <span
      class="min-w-0 flex-1 truncate {band ? 't-micro text-fg-muted' : 't-micro text-fg'}
        {faded ? 'line-through opacity-70' : ''}"
    >
      {label}
    </span>
    {@render trailing?.()}
    <Avatars {people} size={17} max={2} />
  </button>

  {#if place.clippedStart}
    <button
      type="button"
      aria-label="Scroll to where {label} starts"
      onclick={() => onjump?.(shown.start)}
      class="press-sm absolute inset-y-0 left-0 flex w-5 items-center justify-center rounded-l-sm bg-surface/60 text-fg-muted"
    >
      <ChevronLeft size={12} />
    </button>
  {:else if handles}
    <button
      type="button"
      aria-label="Move the start of {label}"
      onpointerdown={(event) => begin(event, "start")}
      class="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-sm hover:bg-fg/15"
    ></button>
  {/if}

  {#if place.clippedEnd}
    <button
      type="button"
      aria-label="Scroll to where {label} ends"
      onclick={() => onjump?.(shown.end)}
      class="press-sm absolute inset-y-0 right-0 flex w-5 items-center justify-center rounded-r-sm bg-surface/60 text-fg-muted"
    >
      <ChevronRight size={12} />
    </button>
  {:else if handles}
    <button
      type="button"
      aria-label="Move the end of {label}"
      onpointerdown={(event) => begin(event, "end")}
      class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-sm hover:bg-fg/15"
    ></button>
  {/if}
</div>
