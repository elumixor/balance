<script lang="ts">
  import { tick } from "svelte";
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
   * Seven days of hours, and the weeks either side of them a swipe away — scrolling sideways is
   * how you change week, so the grid never spends a corner on arrows. The three panes are the
   * previous, current and next week; letting go on a neighbour makes it the current one and
   * re-centres, so the scroll can go on forever in either direction.
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
  /** How long the scroll has to sit still before it counts as having landed on a week. */
  const SETTLE_MS = 120;

  const data = calendarData;

  let viewWidth = $state(0);
  let columnEls = $state<(HTMLElement | undefined)[]>([]);
  let settle: ReturnType<typeof setTimeout> | null = null;

  const paneWidth = $derived(Math.max(0, viewWidth - GUTTER_PX));

  const panes = $derived(
    data.panes.map((pane) => {
      const events = pane.week.value?.events ?? [];
      const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(pane.start, i));
      const segments = segmentsForWeek(events, pane.start);
      return {
        ...pane,
        days,
        allDay: allDaySpansForWeek(events, pane.start),
        placedByDay: days.map((_, dayIndex) => placeDay(segments.filter((s) => s.dayIndex === dayIndex))),
      };
    }),
  );

  // One header height for every pane, or the hour labels would only line up with some of them.
  const headerPx = $derived(DAY_HEAD_PX + (panes.some((p) => p.allDay.length > 0) ? ALL_DAY_PX : 0));
  const todayStart = $derived(startOfDay(new Date()).getTime());
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

  // The middle pane is always the current week, so that's the one the pointer hit-tests against.
  $effect(() => {
    data.columnsEl = columnEls[1];
  });

  // Opens on the working day, centred on the current week.
  $effect(() => {
    const scroller = data.scrollerEl;
    if (!scroller || paneWidth === 0) return;
    // Next frame: the panes have to be laid out at their new width before an offset into them
    // means anything — set it too early and the browser clamps it to a scroll range of zero.
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = OPENING_HOUR * HOUR_PX;
      centre();
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Puts the current week back under the viewport, in the frame and the one after it. */
  function centre() {
    const scroller = data.scrollerEl;
    if (!scroller || paneWidth === 0) return;
    scroller.scrollLeft = paneWidth;
    requestAnimationFrame(() => {
      scroller.scrollLeft = paneWidth;
    });
  }

  function onscroll() {
    if (settle) clearTimeout(settle);
    settle = setTimeout(land, SETTLE_MS);
  }

  /** Whichever pane the scroll came to rest on becomes the week, and the panes shift under it. */
  async function land() {
    const scroller = data.scrollerEl;
    if (!scroller || paneWidth === 0 || data.drag) return;
    const index = Math.round(scroller.scrollLeft / paneWidth);
    if (index === 1) return;
    data.goToWeek(index - 1);
    // The panes only hold their new weeks after the update, and the scroll only holds after that.
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
  <div class="flex" style="width:{GUTTER_PX + 3 * paneWidth}px">
    <!-- The hours stay put while the weeks slide past them. -->
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

    <!-- Deliberately unkeyed: the panes are three fixed slots the weeks move through, and the
         middle slot has to stay the middle slot when the week changes under it. -->
    {#each panes as pane, paneIndex}
      {@const interactive = pane.offset === 0}
      <div class="shrink-0 snap-start" style="width:{paneWidth}px">
        <div class="sticky top-0 z-20 border-line border-b bg-surface" style="height:{headerPx}px">
          <div class="grid grid-cols-7" style="height:{DAY_HEAD_PX}px">
            {#each pane.days as day (day.getTime())}
              {@const today = day.getTime() === todayStart}
              <div class="flex flex-col justify-center border-line border-l px-1 text-center">
                <div class="t-micro text-fg-faint">{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div class="t-data-strong {today ? 'text-fg' : 'text-fg-muted'}">{day.getDate()}</div>
              </div>
            {/each}
          </div>

          {#if headerPx > DAY_HEAD_PX}
            <div class="grid grid-cols-7 gap-px px-px" style="height:{ALL_DAY_PX}px">
              {#each pane.allDay as span (span.event.id)}
                <div class="relative py-0.5" style="grid-column:{span.dayIndex + 1} / span {span.days}">
                  <EventBlock
                    event={span.event}
                    {categories}
                    narrow
                    onclick={(box) => data.select(span.event, box)}
                  />
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- One background gradient rather than 168 hour-line elements. -->
        <div
          bind:this={columnEls[paneIndex]}
          class="relative grid grid-cols-7"
          style="height:{24 * HOUR_PX}px;background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px {HOUR_PX}px)"
        >
          {#each pane.days as day, dayIndex (day.getTime())}
            <div class="relative border-line border-l">
              {#each pane.placedByDay[dayIndex] as segment (segment.event.id)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="absolute px-px {interactive ? 'touch-none' : ''}"
                  style="top:{segment.top}px;height:{segment.height}px;left:{segment.leftPercent}%;width:{segment.widthPercent}%"
                  onpointerdown={(e) => interactive && data.beginMove(segment.event, e)}
                  onpointermove={(e) => interactive && data.moveDrag(e)}
                  onpointerup={() => interactive && data.endDrag()}
                  onpointercancel={() => interactive && data.endDrag()}
                >
                  <EventBlock
                    event={segment.event}
                    {categories}
                    narrow={segment.widthPercent < NARROW_BLOCK_PERCENT || segment.height < (2 * HOUR_PX) / 3}
                    flatTop={segment.continuesBefore}
                    flatBottom={segment.continuesAfter}
                    onclick={(box) => data.select(segment.event, box)}
                  />
                  {#if interactive && !segment.event.readOnly && !segment.continuesAfter}
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

              {#if interactive && ghostEvent && data.drag?.dayIndex === dayIndex}
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
    {/each}
  </div>
</div>
