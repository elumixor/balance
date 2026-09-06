<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { daysBetween, minutesIntoDay, MS_PER_MINUTE } from "$lib/calendar/dates";
  import { type CalendarEvent, NOT_A_MEETING } from "$lib/calendar/types";
  import { BLOCK_GUTTER_PX, daySpans, type PlacedSegment } from "$lib/calendar/week-grid";
  import type { Category } from "$lib/core/records";
  import EventBlock from "./EventBlock.svelte";

  /**
   * What a drag looks like while it is still in the hand: the block itself following the pointer
   * unsnapped, a dashed outline where letting go will land it, and one outline per other block in
   * a dragged batch. All of it is pointer-transparent — the column underneath is what the drag
   * measures against.
   */
  let {
    hourPx,
    dayWidth,
    placedByDay,
    categories,
  }: {
    hourPx: number;
    dayWidth: number;
    placedByDay: readonly (readonly PlacedSegment[])[];
    categories: Map<string, Category>;
  } = $props();

  const data = calendarData;

  /** The dragged block's own slot, so the free-floating preview keeps its real width. */
  const draggedSegment = $derived.by(() => {
    const id = data.drag?.event?.id;
    if (!id) return null;
    for (const dayEntries of placedByDay) {
      const found = dayEntries.find((s) => s.event.id === id);
      if (found) return found;
    }
    return null;
  });
  const ghostWidth = $derived(draggedSegment?.width ?? dayWidth - BLOCK_GUTTER_PX);
  const ghostLeft = $derived(draggedSegment?.left ?? 0);

  /**
   * Where the rest of a dragged batch will land: the same distance the held block has travelled,
   * as an outline each, so a batch move shows what it's about to do to every block in it.
   */
  const batchTargets = $derived.by(() => {
    const drag = data.drag;
    if (!drag?.event || drag.others.length === 0) return [];
    const target = new Date(drag.day);
    target.setMinutes(drag.startMinutes);
    const shiftStart = drag.kind === "resize" ? 0 : target.getTime() - new Date(drag.event.start).getTime();
    const shiftEnd = new Date(drag.day).setMinutes(drag.endMinutes) - new Date(drag.event.end).getTime();

    return drag.others.flatMap((event) => {
      const start = new Date(new Date(event.start).getTime() + shiftStart);
      const end = new Date(new Date(event.end).getTime() + shiftEnd);
      const dayIndex = daysBetween(data.stripStart, start);
      const startMinutes = minutesIntoDay(start);
      const endMinutes = startMinutes + (end.getTime() - start.getTime()) / MS_PER_MINUTE;
      return daySpans(startMinutes, endMinutes).map((span) => ({
        id: `${event.id}:${span.dayOffset}`,
        left: (dayIndex + span.dayOffset) * dayWidth,
        top: (span.startMinutes / 60) * hourPx,
        height: Math.max(2, ((span.endMinutes - span.startMinutes) / 60) * hourPx),
      }));
    });
  });

  /** The drag ghost borrows the block's own look, so what you're dropping is what you'll get. */
  const ghostEvent = $derived.by((): CalendarEvent | null => {
    const drag = data.drag;
    if (!drag) return null;
    const start = new Date(drag.day);
    start.setMinutes(drag.startMinutes);
    const end = new Date(drag.day);
    end.setMinutes(drag.endMinutes);
    return {
      id: "__ghost__",
      calendarId: "",
      seriesId: null,
      title: drag.title,
      description: null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      declined: false,
      tentative: false,
      readOnly: true,
      movable: false,
      countsTowardHours: true,
      url: null,
      mappingScope: null,
      activityId: drag.activityId,
      activityName: null,
      weights: drag.weights,
      ...NOT_A_MEETING,
      projectId: drag.source?.projectId ?? null,
      taskId: drag.source?.taskId ?? null,
    };
  });
</script>

{#each batchTargets as target (target.id)}
  <!-- The rest of the batch, outlined where the same distance takes them. -->
  <div
    class="pointer-events-none absolute z-40 rounded-sm border-2 border-fg/40 border-dashed"
    style="left:{target.left}px;width:{dayWidth - BLOCK_GUTTER_PX}px;top:{target.top}px;height:{target.height}px"
  ></div>
{/each}

{#if data.drag}
  {@const snappedIndex = daysBetween(data.stripStart, data.drag.day)}
  <!-- Where the block will land once let go — snapped, not where it's held. A drag that
       reaches past midnight lands as one rectangle per day it covers. -->
  {#each daySpans(data.drag.startMinutes, data.drag.endMinutes) as span (span.dayOffset)}
    <div
      class="pointer-events-none absolute z-40 rounded-sm border-2 border-fg/50 border-dashed"
      style="left:{(snappedIndex + span.dayOffset) * dayWidth + ghostLeft}px;width:{ghostWidth}px;top:{(span.startMinutes / 60) *
        hourPx}px;height:{((span.endMinutes - span.startMinutes) / 60) * hourPx}px"
    ></div>
  {/each}
{/if}

{#if ghostEvent && data.drag}
  <!-- The block itself, following the pointer unsnapped on both axes, split the same way. -->
  {@const ghostSpans = daySpans(data.drag.freeStartMinutes, data.drag.freeEndMinutes)}
  {#each ghostSpans as span, i (span.dayOffset)}
    <div
      class="pointer-events-none absolute z-40"
      style="left:{(data.drag.freeDayIndex + span.dayOffset) * dayWidth + ghostLeft}px;width:{ghostWidth}px;top:{(span.startMinutes /
        60) *
        hourPx}px;height:{((span.endMinutes - span.startMinutes) / 60) * hourPx}px"
    >
      <EventBlock event={ghostEvent} {categories} ghost flatTop={i > 0} flatBottom={i < ghostSpans.length - 1} />
    </div>
  {/each}
{/if}
