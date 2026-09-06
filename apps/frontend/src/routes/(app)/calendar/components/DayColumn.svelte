<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { type PlacedSegment, resizeBands } from "$lib/calendar/week-grid";
  import type { Category } from "$lib/core/records";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import type { TransitionConfig } from "svelte/transition";
  import EventBlock from "./EventBlock.svelte";
  import NowLine from "./NowLine.svelte";
  import TravelBand from "./TravelBand.svelte";

  /**
   * One day of the strip. The column itself is a fixed slot that always exists — it's what the
   * scroll offset is measured in. Only its blocks come and go with the window.
   *
   * Blocks are absolutely positioned inside the column rather than laid out by the grid, because
   * two events at the same hour have to sit beside each other — something no row-based layout can
   * express.
   */
  let {
    day,
    blocks,
    today,
    inWindow,
    hourPx,
    appear,
    categories,
  }: {
    day: Date;
    blocks: readonly PlacedSegment[];
    today: boolean;
    /** Whether the window is over this column, as against the runway either side. */
    inWindow: boolean;
    hourPx: number;
    appear: (node: Element, params: { id: string }) => TransitionConfig;
    categories: Map<string, Category>;
  } = $props();

  const data = calendarData;

  const weekend = $derived(day.getDay() === 0 || day.getDay() === 6);
  /** While a day is being planned the others step back: still there to drag from, but the lit
   *  day is the one the eye lands on. */
  const dimmed = $derived(planMode.active && !planMode.isDay(day));

  /** Enter or Space on a focused block does what a tap does. */
  function onkeydown(e: KeyboardEvent & { currentTarget: HTMLElement }, segment: PlacedSegment) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    data.tap(segment.event, e.currentTarget.getBoundingClientRect(), e.metaKey || e.ctrlKey);
  }
</script>

<div
  class="relative snap-start border-line border-l transition-opacity duration-300 {weekend ? 'bg-fg/[0.02]' : ''} {dimmed
    ? 'opacity-45'
    : ''}"
>
  {#each blocks as segment (segment.event.id)}
    <!-- Alt held: the original stays put in full, since the pointer is dragging a copy. -->
    {@const dragging = data.drag?.event?.id === segment.event.id && !data.drag?.copy}
    <!-- The rest of a dragged batch stays where it is, faded, with its target outlined. -->
    {@const trailing = !data.drag?.copy && (data.drag?.others.some((other) => other.id === segment.event.id) ?? false)}
    <!-- A block sits over the ones it collides with, and the open block over everything,
         so what you're working on is what the pointer finds — including its handles,
         which may hang outside a short block. -->
    {@const isSelected = data.selected?.id === segment.event.id}
    <!-- Resize bands sized off the drawn height, so the two can never meet and never eat
         the middle, which is what opens the event. -->
    {@const bands = resizeBands(segment.height, isSelected)}
    {#if !dragging}
      <TravelBand {segment} {categories} {hourPx} {inWindow} />
    {/if}
    <!-- The block inside is the focus stop; this answers the keys and the pointer around it. -->
    <div
      data-event
      role="button"
      tabindex="-1"
      class="absolute touch-none select-none {dragging ? 'opacity-0' : trailing ? 'opacity-40' : ''}"
      style="top:{segment.top}px;height:{segment.height}px;left:{segment.left}px;width:{segment.width}px;z-index:{isSelected
        ? 30
        : segment.depth}"
      in:appear={{ id: segment.event.id }}
      onpointerdown={(e) => data.beginMove(segment.event, e)}
      onpointermove={(e) => data.moveDrag(e)}
      onpointerup={(e) => data.endDrag(e)}
      onpointercancel={() => data.endDrag()}
      onclick={(e) => data.tap(segment.event, e.currentTarget.getBoundingClientRect(), e.metaKey || e.ctrlKey)}
      onkeydown={(e) => onkeydown(e, segment)}
      oncontextmenu={(e) => {
        e.preventDefault();
        data.openContextMenu(segment.event, e);
      }}
    >
      <EventBlock
        event={segment.event}
        {categories}
        stacked={segment.depth > 0}
        flatTop={segment.continuesBefore}
        flatBottom={segment.continuesAfter}
      />
      <!-- The handles are pointer-only: a keyboard has the card's time fields for the same job. -->
      {#if bands.band > 0 && segment.event.movable && !segment.continuesAfter}
        <span
          role="button"
          tabindex="-1"
          aria-label="Drag to change when it ends"
          class="absolute right-0 left-5 z-20 cursor-ns-resize touch-none"
          style="height:{bands.band}px;bottom:{-bands.overhang}px"
          onpointerdown={(e) => data.beginResize(segment.event, e)}
          onpointermove={(e) => data.moveDrag(e)}
          onpointerup={(e) => data.endDrag(e)}
          onpointercancel={() => data.endDrag()}
        ></span>
      {/if}
      {#if bands.band > 0 && segment.event.movable && !segment.continuesBefore}
        <span
          role="button"
          tabindex="-1"
          aria-label="Drag to change when it starts"
          class="absolute right-0 left-5 z-20 cursor-ns-resize touch-none"
          style="height:{bands.band}px;top:{-bands.overhang}px"
          onpointerdown={(e) => data.beginResizeStart(segment.event, e)}
          onpointermove={(e) => data.moveDrag(e)}
          onpointerup={(e) => data.endDrag(e)}
          onpointercancel={() => data.endDrag()}
        ></span>
      {/if}
    </div>
  {/each}

  {#if today}
    <NowLine {hourPx} />
  {/if}
</div>
