<script lang="ts">
  import { addDays, DAYS_PER_WEEK, minutesIntoDay, startOfDay } from "$lib/dates";
  import type { CalendarEvent, Category } from "$lib/types";
  import { calendarData } from "./calendar-data.svelte";
  import EventBlock from "./EventBlock.svelte";
  import {
    allDaySpansForWeek,
    HOUR_PX,
    NARROW_BLOCK_PERCENT,
    OPENING_HOUR,
    placeDay,
    segmentsForWeek,
  } from "./week-grid";

  /**
   * Seven days of hours. Events are absolutely positioned inside their day column rather than
   * laid out by the grid, because two events at the same hour have to sit beside each other —
   * something no row-based layout can express.
   */
  let { categories }: { categories: Map<string, Category> } = $props();

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const data = calendarData;

  const days = $derived(Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(data.weekStart, i)));
  const allDay = $derived(allDaySpansForWeek(data.events, data.weekStart));
  const placedByDay = $derived.by(() => {
    const segments = segmentsForWeek(data.events, data.weekStart);
    return days.map((_, dayIndex) => placeDay(segments.filter((s) => s.dayIndex === dayIndex)));
  });

  const todayIndex = $derived(days.findIndex((d) => d.getTime() === startOfDay(new Date()).getTime()));
  const nowTop = $derived((minutesIntoDay(new Date()) / 60) * HOUR_PX);

  const pad = (n: number) => n.toString().padStart(2, "0");

  /** The drag ghost borrows the block's own look, so what you're dropping is what you'll get. */
  const ghostEvent = $derived.by((): CalendarEvent | null => {
    const drag = data.drag;
    if (!drag) return null;
    const start = addDays(data.weekStart, drag.dayIndex);
    start.setMinutes(drag.startMinutes);
    const end = addDays(data.weekStart, drag.dayIndex);
    end.setMinutes(drag.endMinutes);
    return {
      id: "__ghost__",
      calendarId: "",
      seriesId: null,
      title: drag.title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      declined: false,
      tentative: false,
      readOnly: true,
      countsTowardHours: true,
      url: null,
      mappingScope: null,
      activityId: drag.activityId,
      activityName: null,
      weights: drag.weights,
    };
  });

  $effect(() => {
    const scroller = data.scrollerEl;
    if (scroller) scroller.scrollTop = OPENING_HOUR * HOUR_PX;
  });
</script>

<div class="overflow-hidden rounded-lg border border-line bg-surface">
  <div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-line border-b">
    <div></div>
    {#each days as day, i (day.getTime())}
      <div class="border-line border-l px-1 py-2 text-center">
        <div class="t-micro text-fg-faint">{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
        <div class="t-data-strong {i === todayIndex ? 'text-fg' : 'text-fg-muted'}">{day.getDate()}</div>
      </div>
    {/each}
  </div>

  {#if allDay.length > 0}
    <div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-px border-line border-b py-1">
      <div class="t-data-micro self-center px-2 text-fg-faint">all-day</div>
      {#each allDay as span (span.event.id)}
        <div class="relative h-6" style="grid-column:{span.dayIndex + 2} / span {span.days}">
          <EventBlock
            event={span.event}
            {categories}
            narrow
            onclick={() => (data.selected = span.event)}
          />
        </div>
      {/each}
    </div>
  {/if}

  <div bind:this={data.scrollerEl} class="max-h-[65dvh] overflow-y-auto overscroll-contain">
    <div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style="height:{24 * HOUR_PX}px">
      <div class="relative">
        {#each HOURS as hour (hour)}
          <div class="t-data-micro absolute right-2 -translate-y-1/2 text-fg-faint" style="top:{hour * HOUR_PX}px">
            {hour === 0 ? "" : `${pad(hour)}:00`}
          </div>
        {/each}
      </div>

      <!-- One background gradient rather than 168 hour-line elements. -->
      <div
        bind:this={data.columnsEl}
        class="relative col-span-7 grid grid-cols-7"
        style="background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px {HOUR_PX}px)"
      >
        {#each days as day, dayIndex (day.getTime())}
          <div class="relative border-line border-l">
            {#each placedByDay[dayIndex] as segment (segment.event.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="absolute touch-none px-px"
                style="top:{segment.top}px;height:{segment.height}px;left:{segment.leftPercent}%;width:{segment.widthPercent}%"
                onpointerdown={(e) => data.beginMove(segment.event, e)}
                onpointermove={(e) => data.moveDrag(e)}
                onpointerup={() => data.endDrag()}
                onpointercancel={() => data.endDrag()}
              >
                <EventBlock
                  event={segment.event}
                  {categories}
                  narrow={segment.widthPercent < NARROW_BLOCK_PERCENT || segment.height < (2 * HOUR_PX) / 3}
                  flatTop={segment.continuesBefore}
                  flatBottom={segment.continuesAfter}
                  onclick={() => (data.selected = segment.event)}
                />
                {#if !segment.event.readOnly && !segment.continuesAfter}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    class="absolute inset-x-0 bottom-0 h-3 cursor-ns-resize touch-none"
                    onpointerdown={(e) => data.beginResize(segment.event, e)}
                    onpointermove={(e) => data.moveDrag(e)}
                    onpointerup={() => data.endDrag()}
                    onpointercancel={() => data.endDrag()}
                  ></span>
                {/if}
              </div>
            {/each}

            {#if ghostEvent && data.drag?.dayIndex === dayIndex}
              <div
                class="absolute inset-x-0 px-px"
                style="top:{(data.drag.startMinutes / 60) * HOUR_PX}px;height:{((data.drag.endMinutes -
                  data.drag.startMinutes) /
                  60) *
                  HOUR_PX}px"
              >
                <EventBlock event={ghostEvent} {categories} ghost narrow />
              </div>
            {/if}
          </div>
        {/each}

        {#if todayIndex >= 0}
          <div class="pointer-events-none absolute inset-x-0 h-px bg-danger" style="top:{nowTop}px"></div>
        {/if}
      </div>
    </div>
  </div>
</div>
