<script lang="ts">
  import { tick } from "svelte";
  import { addDays, minutesIntoDay, startOfDay } from "$lib/dates";
  import type { CalendarEvent, Category } from "$lib/types";
  import { calendarData, STRIP_DAYS } from "./calendar-data.svelte";
  import EventBlock from "./EventBlock.svelte";
  import {
    allDaySpansForRange,
    HOUR_PX,
    NARROW_BLOCK_PERCENT,
    OPENING_HOUR,
    placeDay,
    segmentsForRange,
  } from "./week-grid";

  /**
   * Seven days of hours, with a week either side of them a swipe away — scrolling sideways is how
   * the days change, so the grid never spends a corner on arrows. Twenty-one columns are drawn and
   * seven fit; coming to rest on a column makes it the first day on screen, and the strip re-centres
   * under it, so the scroll can go on forever in either direction.
   *
   * Events are absolutely positioned inside their day column rather than laid out by the grid,
   * because two events at the same hour have to sit beside each other — something no row-based
   * layout can express.
   */
  let { categories }: { categories: Map<string, Category> } = $props();

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const GUTTER_PX = 56;
  const DAY_HEAD_PX = 44;
  const ALL_DAY_PX = 28;
  const VISIBLE_DAYS = 7;
  /** How long the scroll has to sit still before it counts as having landed on a day. */
  const SETTLE_MS = 120;

  const data = calendarData;

  let viewWidth = $state(0);
  let settle: ReturnType<typeof setTimeout> | null = null;

  const dayWidth = $derived(Math.max(0, viewWidth - GUTTER_PX) / VISIBLE_DAYS);
  const columns = $derived(`repeat(${STRIP_DAYS},${dayWidth}px)`);
  const days = $derived(Array.from({ length: STRIP_DAYS }, (_, i) => addDays(data.stripStart, i)));

  const placedByDay = $derived.by(() => {
    const segments = segmentsForRange(data.events, data.stripStart, STRIP_DAYS);
    return days.map((_, index) => placeDay(segments.filter((s) => s.dayIndex === index)));
  });
  const allDay = $derived(allDaySpansForRange(data.events, data.stripStart, STRIP_DAYS));
  const headerPx = $derived(DAY_HEAD_PX + (allDay.length > 0 ? ALL_DAY_PX : 0));

  const todayStart = $derived(startOfDay(new Date()).getTime());
  const nowTop = $derived((minutesIntoDay(new Date()) / 60) * HOUR_PX);

  const pad = (n: number) => n.toString().padStart(2, "0");

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
      countsTowardHours: true,
      url: null,
      mappingScope: null,
      activityId: drag.activityId,
      activityName: null,
      weights: drag.weights,
    };
  });

  // Opens on the working day, with the window's first day against the hours.
  $effect(() => {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0) return;
    // Next frame: the columns have to be laid out at their new width before an offset into them
    // means anything — set it too early and the browser clamps it to a scroll range of zero.
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = OPENING_HOUR * HOUR_PX;
      centre();
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Puts the window's first day back against the hours, in this frame and the one after it. */
  function centre() {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0) return;
    const left = data.dayOffset * dayWidth;
    scroller.scrollLeft = left;
    requestAnimationFrame(() => {
      scroller.scrollLeft = left;
    });
  }

  function onscroll() {
    if (settle) clearTimeout(settle);
    settle = setTimeout(land, SETTLE_MS);
  }

  /** The column the scroll came to rest on becomes the first day, and the strip shifts under it. */
  async function land() {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0 || data.drag) return;
    const shift = Math.round(scroller.scrollLeft / dayWidth) - data.dayOffset;
    if (shift === 0) return;
    data.goToDay(shift);
    // The strip only holds its new days after the update, and the scroll only holds after that.
    await tick();
    centre();
  }
</script>

<div
  bind:this={data.scrollerEl}
  bind:clientWidth={viewWidth}
  {onscroll}
  class="h-full snap-x snap-mandatory overflow-auto overscroll-contain scroll-pl-14 bg-surface"
>
  <div class="flex" style="width:{GUTTER_PX + STRIP_DAYS * dayWidth}px">
    <!-- The hours stay put while the days slide past them. -->
    <div class="sticky left-0 z-30 flex shrink-0 flex-col bg-surface" style="width:{GUTTER_PX}px">
      <div class="sticky top-0 z-10 shrink-0 border-line border-b bg-surface" style="height:{headerPx}px"></div>
      <div class="relative" style="height:{24 * HOUR_PX}px">
        {#each HOURS as hour (hour)}
          <div class="t-data-micro absolute right-2 -translate-y-1/2 text-fg-faint" style="top:{hour * HOUR_PX}px">
            {hour === 0 ? "" : `${pad(hour)}:00`}
          </div>
        {/each}
      </div>
    </div>

    <div class="min-w-0">
      <div class="sticky top-0 z-20 border-line border-b bg-surface" style="height:{headerPx}px">
        <div class="grid" style="grid-template-columns:{columns};height:{DAY_HEAD_PX}px">
          {#each days as day (day.getTime())}
            {@const today = day.getTime() === todayStart}
            <div class="flex flex-col justify-center border-line border-l px-1 text-center">
              <div class="t-micro text-fg-faint">{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div class="t-data-strong {today ? 'text-fg' : 'text-fg-muted'}">{day.getDate()}</div>
            </div>
          {/each}
        </div>

        {#if allDay.length > 0}
          <div class="grid gap-px px-px" style="grid-template-columns:{columns};height:{ALL_DAY_PX}px">
            {#each allDay as span (span.event.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
              <div
                class="relative py-0.5"
                style="grid-column:{span.dayIndex + 1} / span {span.days}"
                onclick={(e) => data.tap(span.event, e.currentTarget.getBoundingClientRect())}
              >
                <EventBlock event={span.event} {categories} narrow />
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- One background gradient rather than an hour line per row per day. -->
      <div
        bind:this={data.columnsEl}
        class="relative grid"
        style="grid-template-columns:{columns};height:{24 *
          HOUR_PX}px;background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px {HOUR_PX}px)"
      >
        {#each days as day, index (day.getTime())}
          <div class="relative snap-start border-line border-l">
            {#each placedByDay[index] as segment (segment.event.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
              <div
                class="absolute touch-none px-px"
                style="top:{segment.top}px;height:{segment.height}px;left:{segment.leftPercent}%;width:{segment.widthPercent}%"
                onpointerdown={(e) => data.beginMove(segment.event, e)}
                onpointermove={(e) => data.moveDrag(e)}
                onpointerup={() => data.endDrag()}
                onpointercancel={() => data.endDrag()}
                onclick={(e) => data.tap(segment.event, e.currentTarget.getBoundingClientRect())}
              >
                <EventBlock
                  event={segment.event}
                  {categories}
                  narrow={segment.widthPercent < NARROW_BLOCK_PERCENT || segment.height < (2 * HOUR_PX) / 3}
                  flatTop={segment.continuesBefore}
                  flatBottom={segment.continuesAfter}
                />
                {#if !segment.event.readOnly && !segment.continuesAfter}
                  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
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

            {#if ghostEvent && data.drag && data.drag.day.getTime() === day.getTime()}
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

            {#if day.getTime() === todayStart}
              <div class="pointer-events-none absolute inset-x-0 h-px bg-danger" style="top:{nowTop}px"></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
