<script lang="ts">
  import { addDays, minutesIntoDay, startOfDay } from "$lib/dates";
  import type { CalendarEvent, Category } from "$lib/types";
  import { calendarData, STRIP_DAYS } from "./calendar-data.svelte";
  import Button from "$lib/components/Button.svelte";
  import EventBlock from "./EventBlock.svelte";
  import { fade, fly } from "svelte/transition";
  import EventContextMenu from "./EventContextMenu.svelte";
  import {
    allDaySpansForRange,
    HOUR_PX,
    NARROW_BLOCK_PERCENT,
    OPENING_HOUR,
    placeDay,
    resizeBands,
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
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const JUMP_ANIMATE_MS = 300;

  const data = calendarData;

  let viewWidth = $state(0);
  let settle: ReturnType<typeof setTimeout> | null = null;
  /** Which strip the current scroll offset was measured against, and whether it's been placed yet. */
  let stripAt: number | null = null;
  let opened = false;
  /** Raw scroll offset, updated on every scroll tick — unlike `data.dayOffset`, live mid-drag. */
  let liveScrollLeft = $state(0);
  /** Set right before a programmatic jump (the today button) so the next scroll-left write eases in. */
  let animateNextJump = false;
  let jumpFrame: number | null = null;

  const dayWidth = $derived(Math.max(0, viewWidth - GUTTER_PX) / VISIBLE_DAYS);
  const columns = $derived(`repeat(${STRIP_DAYS},${dayWidth}px)`);
  const days = $derived(Array.from({ length: STRIP_DAYS }, (_, i) => addDays(data.stripStart, i)));

  const placedByDay = $derived.by(() => {
    const segments = segmentsForRange(data.events, data.stripStart, STRIP_DAYS);
    return days.map((_, index) => placeDay(segments.filter((s) => s.dayIndex === index)));
  });

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
  const ghostWidthPercent = $derived(draggedSegment?.widthPercent ?? 100);
  const ghostLeftPercent = $derived(draggedSegment?.leftPercent ?? 0);
  const allDay = $derived(allDaySpansForRange(data.events, data.stripStart, STRIP_DAYS));
  /** Row count reserved by the header only counts spans touching the days actually on screen —
   *  tracks the live scroll position so it grows/shrinks while scrolling, not just once settled. */
  const allDayRows = $derived.by(() => {
    const offset = dayWidth > 0 ? liveScrollLeft / dayWidth : data.dayOffset;
    return allDay.reduce(
      (max, span) =>
        span.dayIndex + span.days > offset && span.dayIndex < offset + VISIBLE_DAYS
          ? Math.max(max, span.row + 1)
          : max,
      0,
    );
  });
  const headerPx = $derived(DAY_HEAD_PX + allDayRows * ALL_DAY_PX);

  const todayStart = $derived(startOfDay(new Date()).getTime());
  const nowTop = $derived((minutesIntoDay(new Date()) / 60) * HOUR_PX);
  /** Whether today's column sits outside the seven days currently on screen — tracks the live
   *  scroll position, so it updates mid-drag rather than only once the scroll settles. */
  const todayOutOfView = $derived.by(() => {
    const todayDayIndex = Math.round((todayStart - data.stripStart.getTime()) / MS_PER_DAY);
    const offset = dayWidth > 0 ? liveScrollLeft / dayWidth : data.dayOffset;
    return todayDayIndex + 1 <= offset || todayDayIndex >= offset + VISIBLE_DAYS;
  });

  /** The gathering box, in pixels down the grid rather than the grid's own day-and-minute units. */
  const marqueeBox = $derived.by(() => {
    const box = data.marquee;
    if (!box) return null;
    const left = Math.min(box.fromDay, box.toDay) * dayWidth;
    const top = (Math.min(box.fromMinutes, box.toMinutes) / 60) * HOUR_PX;
    return {
      left,
      top,
      width: Math.abs(box.toDay - box.fromDay) * dayWidth,
      height: (Math.abs(box.toMinutes - box.fromMinutes) / 60) * HOUR_PX,
    };
  });

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
    const shiftEnd =
      new Date(drag.day).setMinutes(drag.endMinutes) - new Date(drag.event.end).getTime();

    return drag.others.map((event) => {
      const start = new Date(new Date(event.start).getTime() + shiftStart);
      const end = new Date(new Date(event.end).getTime() + shiftEnd);
      const dayIndex = Math.round((startOfDay(start).getTime() - data.stripStart.getTime()) / MS_PER_DAY);
      const startMinutes = minutesIntoDay(start);
      return {
        id: event.id,
        left: dayIndex * dayWidth,
        top: (startMinutes / 60) * HOUR_PX,
        height: Math.max(2, ((end.getTime() - start.getTime()) / 60_000 / 60) * HOUR_PX),
      };
    });
  });

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

  // Opens on the working day, with the window's first day against the hours. Re-runs on a resize
  // (a different column width means the same offset points at a different day) and whenever the
  // window jumps programmatically (goToToday, goToDay from outside a swipe).
  $effect(() => {
    const scroller = data.scrollerEl;
    const width = dayWidth;
    const offset = data.dayOffset;
    const start = data.stripStart.getTime();
    if (!scroller || width === 0) return;
    // Next frame: the columns have to be laid out at their new width before an offset into them
    // means anything — set it too early and the browser clamps it to a scroll range of zero.
    const frame = requestAnimationFrame(() => {
      if (!opened) scroller.scrollTop = OPENING_HOUR * HOUR_PX;
      opened = true;
      if (animateNextJump) {
        animateNextJump = false;
        animateScrollLeft(scroller, offset * width);
      } else {
        if (jumpFrame !== null) cancelAnimationFrame(jumpFrame);
        jumpFrame = null;
        scroller.scrollLeft = offset * width;
        liveScrollLeft = scroller.scrollLeft;
      }
      stripAt = start;
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Eases the scroller to `target` over `JUMP_ANIMATE_MS` rather than snapping straight there. */
  function animateScrollLeft(scroller: HTMLElement, target: number) {
    if (jumpFrame !== null) cancelAnimationFrame(jumpFrame);
    const from = scroller.scrollLeft;
    const delta = target - from;
    if (delta === 0) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / JUMP_ANIMATE_MS);
      const eased = 1 - (1 - t) ** 3;
      scroller.scrollLeft = from + delta * eased;
      jumpFrame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    jumpFrame = requestAnimationFrame(tick);
  }

  /**
   * The strip is rebuilt a week over whenever the window crosses into the next one. Nothing should
   * move on screen when that happens, so the scroll is walked back by exactly the days it shifted.
   */
  $effect(() => {
    const start = data.stripStart.getTime();
    const scroller = data.scrollerEl;
    if (!scroller || stripAt === null || start === stripAt) return;
    scroller.scrollLeft -= Math.round((start - stripAt) / MS_PER_DAY) * dayWidth;
    liveScrollLeft = scroller.scrollLeft;
    stripAt = start;
  });

  function onscroll() {
    if (data.scrollerEl) liveScrollLeft = data.scrollerEl.scrollLeft;
    if (settle) clearTimeout(settle);
    settle = setTimeout(land, SETTLE_MS);
  }

  /** The column the scroll came to rest on becomes the first day on screen. */
  function land() {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0 || data.drag) return;
    const shift = Math.round(scroller.scrollLeft / dayWidth) - data.dayOffset;
    if (shift !== 0) data.goToDay(shift);
  }

  function goToToday() {
    animateNextJump = true;
    data.goToToday();
  }
</script>

<div class="relative h-full">
  {#if todayOutOfView}
    <div
      class="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center"
      in:fly={{ y: 16, duration: 200 }}
      out:fly={{ y: 16, duration: 200 }}
    >
      <div class="pointer-events-auto" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
        <Button
          label="Today"
          size="sm"
          variant="danger"
          onclick={goToToday}
          class="shadow-(--shadow-float)"
        />
      </div>
    </div>
  {/if}

  <div
    bind:this={data.scrollerEl}
    bind:clientWidth={viewWidth}
    {onscroll}
    class="h-full snap-x snap-mandatory overflow-auto overscroll-contain scroll-pl-14 bg-surface"
  >
  <div class="flex" style="width:{GUTTER_PX + STRIP_DAYS * dayWidth}px">
    <!-- The hours stay put while the days slide past them. -->
    <div class="sticky left-0 z-30 flex shrink-0 flex-col bg-surface" style="width:{GUTTER_PX}px">
      <div class="sticky top-0 z-10 shrink-0 border-line border-b bg-surface transition-[height] duration-150" style="height:{headerPx}px"></div>
      <div class="relative" style="height:{24 * HOUR_PX}px">
        {#each HOURS as hour (hour)}
          <div class="t-data-micro absolute right-2 -translate-y-1/2 text-fg-faint" style="top:{hour * HOUR_PX}px">
            {hour === 0 ? "" : `${pad(hour)}:00`}
          </div>
        {/each}
      </div>
    </div>

    <div class="min-w-0">
      <div class="sticky top-0 z-20 border-line border-b bg-surface transition-[height] duration-150" style="height:{headerPx}px">
        <!-- Unkeyed: the columns are fixed slots the days move through, and moving DOM nodes
             under a scroller resets the very scroll offset this grid is holding. -->
        <div class="grid" style="grid-template-columns:{columns};height:{DAY_HEAD_PX}px">
          {#each days as day}
            {@const today = day.getTime() === todayStart}
            <div class="flex flex-col justify-center border-line border-l px-1 text-center">
              <div class="t-micro {today ? 'text-danger' : 'text-fg-faint'}">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div
                class="t-data-strong mx-auto flex h-6 min-w-7 items-center justify-center rounded-md px-1 {today
                  ? 'bg-danger text-ink-fg'
                  : 'text-fg-muted'}"
              >
                {day.getDate()}
              </div>
            </div>
          {/each}
        </div>

        {#if allDayRows > 0}
          <div class="grid" style="grid-template-columns:{columns};height:{allDayRows * ALL_DAY_PX}px">
            {#each days as day, index (day.getTime())}
              <div class="border-line border-l" style="grid-row:1 / span {allDayRows};grid-column:{index + 1}"></div>
            {/each}
            {#each allDay as span (span.event.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="relative py-0.5"
                style="grid-row:{span.row + 1};grid-column:{span.dayIndex + 1} / span {span.days}"
                onclick={(e) =>
                  data.tap(span.event, e.currentTarget.getBoundingClientRect(), e.metaKey || e.ctrlKey)}
                oncontextmenu={(e) => {
                  e.preventDefault();
                  data.openContextMenu(span.event, e);
                }}
              >
                <EventBlock event={span.event} {categories} narrow />
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- One background gradient rather than an hour line per row per day. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={data.columnsEl}
        onpointerdown={(e) => data.beginMarquee(e)}
        onpointermove={(e) => data.moveMarquee(e)}
        onpointerup={() => data.endMarquee()}
        onpointercancel={() => data.endMarquee()}
        class="relative grid"
        style="grid-template-columns:{columns};height:{24 *
          HOUR_PX}px;background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px {HOUR_PX}px)"
      >
        {#each days as day, index}
          {@const weekend = day.getDay() === 0 || day.getDay() === 6}
          <div class="relative snap-start border-line border-l {weekend ? 'bg-fg/[0.02]' : ''}">
            {#each placedByDay[index] as segment (segment.event.id)}
              <!-- Alt held: the original stays put in full, since the pointer is dragging a copy. -->
              {@const dragging = data.drag?.event?.id === segment.event.id && !data.drag?.copy}
              <!-- The rest of a dragged batch stays where it is, faded, with its target outlined. -->
              {@const trailing =
                !data.drag?.copy && (data.drag?.others.some((other) => other.id === segment.event.id) ?? false)}
              <!-- The open block sits above its neighbours, so what you're working on is what the
                   pointer finds — including its handles, which may hang outside a short block. -->
              {@const isSelected = data.selected?.id === segment.event.id}
              <!-- Resize bands sized off the drawn height, so the two can never meet and never eat
                   the middle, which is what opens the event. -->
              {@const bands = resizeBands(segment.height, isSelected)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                data-event
                class="absolute touch-none select-none {isSelected
                  ? 'z-30'
                  : ''} {dragging ? 'opacity-0' : trailing ? 'opacity-40' : ''}"
                style="top:{segment.top}px;height:{segment.height}px;left:{segment.leftPercent}%;width:calc({segment.widthPercent}% - 10px)"
                onpointerdown={(e) => data.beginMove(segment.event, e)}
                onpointermove={(e) => data.moveDrag(e)}
                onpointerup={() => data.endDrag()}
                onpointercancel={() => data.endDrag()}
                onclick={(e) =>
                  data.tap(segment.event, e.currentTarget.getBoundingClientRect(), e.metaKey || e.ctrlKey)}
                oncontextmenu={(e) => {
                  e.preventDefault();
                  data.openContextMenu(segment.event, e);
                }}
              >
                <EventBlock
                  event={segment.event}
                  {categories}
                  narrow={segment.widthPercent < NARROW_BLOCK_PERCENT}
                  flatTop={segment.continuesBefore}
                  flatBottom={segment.continuesAfter}
                />
                {#if bands.band > 0 && !segment.event.readOnly && !segment.continuesAfter}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <span
                    class="absolute right-0 left-5 z-20 cursor-ns-resize touch-none"
                    style="height:{bands.band}px;bottom:{-bands.overhang}px"
                    onpointerdown={(e) => data.beginResize(segment.event, e)}
                    onpointermove={(e) => data.moveDrag(e)}
                    onpointerup={() => data.endDrag()}
                    onpointercancel={() => data.endDrag()}
                  ></span>
                {/if}
                {#if bands.band > 0 && !segment.event.readOnly && !segment.continuesBefore}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <span
                    class="absolute right-0 left-5 z-20 cursor-ns-resize touch-none"
                    style="height:{bands.band}px;top:{-bands.overhang}px"
                    onpointerdown={(e) => data.beginResizeStart(segment.event, e)}
                    onpointermove={(e) => data.moveDrag(e)}
                    onpointerup={() => data.endDrag()}
                    onpointercancel={() => data.endDrag()}
                  ></span>
                {/if}
              </div>
            {/each}

            {#if day.getTime() === todayStart}
              <div class="pointer-events-none absolute inset-x-0 h-px bg-danger" style="top:{nowTop}px"></div>
            {/if}
          </div>
        {/each}

        {#each batchTargets as target (target.id)}
          <!-- The rest of the batch, outlined where the same distance takes them. -->
          <div
            class="pointer-events-none absolute z-40 rounded-sm border-2 border-fg/40 border-dashed"
            style="left:{target.left}px;width:{dayWidth - 10}px;top:{target.top}px;height:{target.height}px"
          ></div>
        {/each}

        {#if marqueeBox}
          <div
            class="pointer-events-none absolute z-40 rounded-sm border border-fg/40 bg-fg/5"
            style="left:{marqueeBox.left}px;top:{marqueeBox.top}px;width:{marqueeBox.width}px;height:{marqueeBox.height}px"
          ></div>
        {/if}

        {#if data.drag}
          {@const snappedIndex = Math.round((data.drag.day.getTime() - data.stripStart.getTime()) / MS_PER_DAY)}
          {@const targetLeft = snappedIndex * dayWidth + (ghostLeftPercent / 100) * dayWidth}
          <!-- Where the block will land once let go — snapped, not where it's held. -->
          <div
            class="pointer-events-none absolute z-40 rounded-sm border-2 border-fg/50 border-dashed"
            style="left:{targetLeft}px;width:{(ghostWidthPercent / 100) * dayWidth -
              10}px;top:{(data.drag.startMinutes / 60) * HOUR_PX}px;height:{((data.drag.endMinutes -
              data.drag.startMinutes) /
              60) *
              HOUR_PX}px"
          ></div>
        {/if}

        {#if ghostEvent && data.drag}
          {@const freeLeft = data.drag.freeDayIndex * dayWidth + (ghostLeftPercent / 100) * dayWidth}
          <!-- The block itself, following the pointer unsnapped on both axes. -->
          <div
            class="pointer-events-none absolute z-40"
            style="left:{freeLeft}px;width:{(ghostWidthPercent / 100) * dayWidth -
              10}px;top:{(data.drag.freeStartMinutes / 60) * HOUR_PX}px;height:{((data.drag.freeEndMinutes -
              data.drag.freeStartMinutes) /
              60) *
              HOUR_PX}px"
          >
            <EventBlock event={ghostEvent} {categories} ghost narrow />
          </div>
        {/if}
      </div>
    </div>
  </div>
  </div>
</div>

{#if data.contextMenuEvent && data.contextMenuRect}
  <EventContextMenu event={data.contextMenuEvent} rect={data.contextMenuRect} categories={[...categories.values()]} />
{/if}
