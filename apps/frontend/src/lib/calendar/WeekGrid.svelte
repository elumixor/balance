<script lang="ts">
  import { addDays, minutesIntoDay, startOfDay } from "$lib/dates";
  import { type CalendarEvent, type Category, NOT_A_MEETING } from "$lib/types";
  import { calendarData, STRIP_DAYS } from "./calendar-data.svelte";
  import Button from "$lib/components/Button.svelte";
  import EventBlock from "./EventBlock.svelte";
  import { fade, fly } from "svelte/transition";
  import EventContextMenu from "./EventContextMenu.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { freeScroll, onWheelGesture, wheelGestureActive } from "./free-scroll";
  import { theme } from "$lib/theme.svelte";
  import SeriesEditPrompt from "./SeriesEditPrompt.svelte";
  import {
    allDaySpansForRange,
    daySpans,
    HOUR_PX,
    NARROW_BLOCK_PERCENT,
    OPENING_HOUR,
    placeDay,
    resizeBands,
    type Segment,
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
  const DAY_HEAD_PX = 28;
  const ALL_DAY_PX = 28;
  const VISIBLE_DAYS = 7;
  /** How long the scroll has to sit still before it counts as having landed on a day. */
  const SETTLE_MS = 120;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const JUMP_ANIMATE_MS = 300;
  /** A settle is a nudge onto the nearest column, not a journey across the strip. */
  const SNAP_ANIMATE_MS = 200;

  const data = calendarData;

  let viewWidth = $state(0);
  let settle: ReturnType<typeof setTimeout> | null = null;
  /** Which strip the current scroll offset was measured against, and whether it's been placed yet. */
  let stripAt: number | null = null;
  let opened = false;
  /**
   * The leftmost column the scroll is over, updated as it moves — unlike `data.dayOffset`, live
   * mid-drag. Whole days rather than pixels: everything reading it only cares which columns are on
   * screen, and a pixel-accurate copy would re-run all of it on every frame of every scroll.
   */
  let liveDayOffset = $state(0);
  let jumpFrame: number | null = null;
  /** True for the whole today-button jump, so the button stays hidden through the intermediate
   *  scroll states (strip recentre snap, then the eased animation) instead of flickering back in. */
  let jumping = $state(false);
  /** True while the grid is easing itself onto a column after a gesture. Deliberately not `$state`:
   *  it's a courtesy nudge of a few pixels, not a jump, and nothing on screen should react to it —
   *  the today button used to share `jumping` and so blinked off after every scroll. */
  let snapping = false;
  /** Set when the window is only catching up to where the scroll already is, so the effect below
   *  leaves the scroll alone instead of writing the position it's already at. */
  let followingScroll = false;
  /**
   * A Monday-to-Monday jump (today, a month arrow, a tapped date) recentres the strip on the same
   * scroll offset it was already at — nothing about the scroll position itself changes, so easing
   * `scrollLeft` there has nothing to ease. This slides the days off and the new ones in from
   * whichever direction the jump moved, so the swap reads as a scroll rather than a hard cut.
   */
  let easing = $state(false);
  let easeDirection = $state(1);

  const dayWidth = $derived(Math.max(0, viewWidth - GUTTER_PX) / VISIBLE_DAYS);
  const columns = $derived(`repeat(${STRIP_DAYS},${dayWidth}px)`);
  const days = $derived(Array.from({ length: STRIP_DAYS }, (_, i) => addDays(data.stripStart, i)));

  /**
   * How far past the seven on screen the blocks are actually drawn. The strip is wide so a fling
   * always has columns ahead of it, but only the days near the window are worth building: the rest
   * would be a few hundred absolutely-positioned nodes nobody can see, rebuilt on every write.
   * Three days of margin covers the columns a fling exposes between two scroll ticks.
   */
  const DRAW_MARGIN_DAYS = 3;
  const firstDrawn = $derived(Math.max(0, liveDayOffset - DRAW_MARGIN_DAYS));
  const lastDrawn = $derived(Math.min(STRIP_DAYS - 1, liveDayOffset + VISIBLE_DAYS - 1 + DRAW_MARGIN_DAYS));
  const isDrawn = (index: number) => index >= firstDrawn && index <= lastDrawn;

  /** Bucketed in one pass rather than a filter per column, which would walk the whole strip's
   *  segments once per column for every change to the events behind them. */
  const placedByDay = $derived.by(() => {
    const byDay: Segment[][] = Array.from({ length: STRIP_DAYS }, () => []);
    for (const segment of segmentsForRange(data.events, data.stripStart, STRIP_DAYS)) {
      byDay[segment.dayIndex]?.push(segment);
    }
    return byDay.map((segments) => placeDay(segments));
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
  /** Rows are reserved for the whole strip, so a banner keeps its row as it scrolls in — but only
   *  the banners near the window are built, the same way the blocks below them are. */
  const drawnAllDay = $derived(
    allDay.filter((span) => span.dayIndex + span.days > firstDrawn && span.dayIndex <= lastDrawn),
  );
  /** Row count reserved by the header only counts spans touching the days actually on screen —
   *  tracks the live scroll position so it grows/shrinks while scrolling, not just once settled. */
  const allDayRows = $derived.by(() => {
    const offset = liveDayOffset;
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
  /**
   * Whether today's column sits outside the seven days currently on screen. Measured against the
   * settled window rather than the live scroll: a fling crosses columns by the handful, and a
   * button that answered each one would blink through the whole gesture. It waits for the week to
   * land, which is also the only moment its answer can still be true a second later.
   */
  const todayOutOfView = $derived.by(() => {
    const todayDayIndex = Math.round((todayStart - data.stripStart.getTime()) / MS_PER_DAY);
    return todayDayIndex < data.dayOffset || todayDayIndex >= data.dayOffset + VISIBLE_DAYS;
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

    return drag.others.flatMap((event) => {
      const start = new Date(new Date(event.start).getTime() + shiftStart);
      const end = new Date(new Date(event.end).getTime() + shiftEnd);
      const dayIndex = Math.round((startOfDay(start).getTime() - data.stripStart.getTime()) / MS_PER_DAY);
      const startMinutes = minutesIntoDay(start);
      const endMinutes = startMinutes + (end.getTime() - start.getTime()) / 60_000;
      return daySpans(startMinutes, endMinutes).map((span) => ({
        id: `${event.id}:${span.dayOffset}`,
        left: (dayIndex + span.dayOffset) * dayWidth,
        top: (span.startMinutes / 60) * HOUR_PX,
        height: Math.max(2, ((span.endMinutes - span.startMinutes) / 60) * HOUR_PX),
      }));
    });
  });

  const pad = (n: number) => n.toString().padStart(2, "0");

  const timeZoneLabel = $derived.by(() => {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
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
      countsTowardHours: true,
      url: null,
      mappingScope: null,
      activityId: drag.activityId,
      activityName: null,
      weights: drag.weights,
      ...NOT_A_MEETING,
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
    // Captured before the strip-rebase effect below gets a turn in this same flush and moves
    // `stripAt` on to `start` itself — this is the one place that still remembers where it was.
    const previousStripAt = stripAt;
    const shouldAnimate = data.animateNextJump;
    if (shouldAnimate) jumping = true;
    // Next frame: the columns have to be laid out at their new width before an offset into them
    // means anything — set it too early and the browser clamps it to a scroll range of zero.
    const frame = requestAnimationFrame(() => {
      if (!opened) scroller.scrollTop = OPENING_HOUR * HOUR_PX;
      opened = true;
      if (shouldAnimate) {
        data.animateNextJump = false;
        scroller.scrollLeft = offset * width;
        liveDayOffset = offset;
        // The strip always recentres on the same offset, so there's no distance here for
        // `scrollLeft` itself to ease across — see the note by `easing` above.
        if (!theme.reduceMotion) {
          easeDirection = previousStripAt !== null && start < previousStripAt ? -1 : 1;
          easing = true;
          requestAnimationFrame(() => {
            easing = false;
            jumping = false;
          });
        } else {
          jumping = false;
        }
      } else if (!jumping && !followingScroll) {
        // Only when the scroll isn't already on the column: a settle that landed dead-on would
        // otherwise take a second, redundant write a frame later.
        if (Math.abs(scroller.scrollLeft - offset * width) >= 1) scroller.scrollLeft = offset * width;
        liveDayOffset = offset;
      }
      followingScroll = false;
      stripAt = start;
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Eases the scroller to `target` rather than snapping straight there. */
  function animateScrollLeft(scroller: HTMLElement, target: number, duration: number, done: () => void) {
    cancelAnimation();
    const from = scroller.scrollLeft;
    const delta = target - from;
    if (delta === 0) return done();
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - t) ** 3;
      scroller.scrollLeft = from + delta * eased;
      jumpFrame = t < 1 ? requestAnimationFrame(tick) : null;
      if (t >= 1) done();
    };
    jumpFrame = requestAnimationFrame(tick);
  }

  /** Drops whatever the grid was easing towards. A new gesture outranks it: the hand is on the
   *  week, and writing a position mid-fling is what kills the fling. */
  function cancelAnimation() {
    if (jumpFrame === null) return;
    cancelAnimationFrame(jumpFrame);
    jumpFrame = null;
    snapping = false;
    jumping = false;
  }

  /**
   * The strip is rebuilt a week over whenever the window crosses into the next one. Nothing should
   * move on screen when that happens, so the scroll is walked back by exactly the days it shifted.
   */
  $effect(() => {
    const start = data.stripStart.getTime();
    const scroller = data.scrollerEl;
    // A programmatic jump lands `scrollLeft` on its own canonical offset a frame from now (see the
    // effect above) — walking it back here first would only flash the wrong columns in between.
    if (!scroller || stripAt === null || start === stripAt || jumping) return;
    scroller.scrollLeft -= Math.round((start - stripAt) / MS_PER_DAY) * dayWidth;
    if (dayWidth > 0) liveDayOffset = Math.round(scroller.scrollLeft / dayWidth);
    stripAt = start;
  });

  /**
   * How close to either end of the loaded strip forces a recentre mid-scroll rather than waiting
   * for the scroll to settle, so a fast continuous scroll always has columns ahead of it instead of
   * running into the physical edge of the DOM and stopping dead. It costs the momentum of the fling
   * that triggered it — setting `scrollLeft` ends a fling — which is why it waits until the runway
   * is nearly gone rather than recentring on every column.
   */
  const EDGE_DAYS = 3;

  function onscroll() {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0) return;
    const offset = scroller.scrollLeft / dayWidth;
    // Whole columns only, so the header and the today button re-run when the day under the left
    // edge changes rather than on every frame of the scroll that gets there.
    const column = Math.round(offset);
    if (column !== liveDayOffset) liveDayOffset = column;
    // A jump or a settle drives the scroll itself and ends on its own column; letting these ticks
    // schedule another settle would have it cut the animation short from underneath.
    if (jumping || snapping) return;
    if (settle) clearTimeout(settle);
    settle = setTimeout(rest, SETTLE_MS);
    if (data.drag) return;
    const maxOffset = STRIP_DAYS - VISIBLE_DAYS;
    if (offset < EDGE_DAYS || offset > maxOffset - EDGE_DAYS) land();
  }

  /** The scroll has stopped moving. On the desktop shell that's only true if the gesture behind it
   *  is over too — a fling has quiet frames in it, and easing onto a column during one would eat
   *  the momentum still queued behind it. The gesture's own end takes over in that case. */
  function rest() {
    if (isDesktop && wheelGestureActive()) return;
    settleOnColumn();
  }

  /** Eases the last few pixels onto the nearest column, then moves the window to it. Only the
   *  desktop shell needs the easing — a browser has CSS snapping to land it (see `freeScroll`). */
  function settleOnColumn() {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0 || data.drag || jumping) return land();
    const target = Math.round(scroller.scrollLeft / dayWidth) * dayWidth;
    if (isDesktop && Math.abs(scroller.scrollLeft - target) >= 1) {
      snapping = true;
      animateScrollLeft(scroller, target, SNAP_ANIMATE_MS, () => {
        snapping = false;
        land();
      });
      return;
    }
    land();
  }

  /** The column the scroll came to rest on becomes the first day on screen. Recentring keeps the
   *  scroll position visually put (see the stripStart-rebuild effect above), so calling this early
   *  near an edge doesn't jump anything — it just makes more columns appear to scroll into. */
  function land() {
    const scroller = data.scrollerEl;
    if (!scroller || dayWidth === 0 || data.drag) return;
    const shift = Math.round(scroller.scrollLeft / dayWidth) - data.dayOffset;
    if (shift === 0) return;
    // The window is following the scroll, not leading it: the effect above must leave the position
    // alone, or a mid-fling recentre would write the scroll back and stop the week dead.
    followingScroll = true;
    data.goToDay(shift);
  }

  // A new gesture cancels whatever the grid was easing towards, and its end — not the gaps inside
  // it — is what lands the week on a column.
  $effect(() =>
    onWheelGesture({
      start: () => {
        if (settle) clearTimeout(settle);
        cancelAnimation();
      },
      end: settleOnColumn,
    }),
  );


</script>

<div class="relative h-full">
  {#if todayOutOfView && !jumping}
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
          onclick={() => data.goToToday()}
          class="shadow-(--shadow-float)"
        />
      </div>
    </div>
  {/if}

  <div
    bind:this={data.scrollerEl}
    bind:clientWidth={viewWidth}
    use:freeScroll
    {onscroll}
    class="no-scrollbar h-full snap-x snap-proximity overflow-auto overscroll-none scroll-pl-14 bg-surface"
  >
  <div class="flex" style="width:{GUTTER_PX + STRIP_DAYS * dayWidth}px">
    <!-- The hours stay put while the days slide past them. -->
    <div class="sticky left-0 z-30 flex shrink-0 flex-col border-line border-r bg-surface" style="width:{GUTTER_PX}px">
      <div
        class="sticky top-0 z-10 flex shrink-0 items-end justify-center border-line border-b bg-surface pb-0.5 transition-[height] duration-150"
        style="height:{headerPx}px"
      >
        <span class="t-data-micro text-fg-faint">{timeZoneLabel}</span>
      </div>
      <div class="relative" style="height:{24 * HOUR_PX}px">
        {#each HOURS as hour (hour)}
          <div class="t-data-micro absolute right-2 -translate-y-1/2 text-fg-faint" style="top:{hour * HOUR_PX}px">
            {hour === 0 ? "" : `${pad(hour)}:00`}
          </div>
        {/each}
      </div>
    </div>

    <div
      class="min-w-0"
      style="transition:{easing ? 'none' : `transform ${JUMP_ANIMATE_MS}ms ease-out`};transform:translateX({easing
        ? easeDirection * Math.max(0, viewWidth - GUTTER_PX)
        : 0}px)"
    >
      <div class="sticky top-0 z-20 border-line border-b bg-surface transition-[height] duration-150" style="height:{headerPx}px">
        <!-- Unkeyed: the columns are fixed slots the days move through, and moving DOM nodes
             under a scroller resets the very scroll offset this grid is holding. -->
        <div class="grid" style="grid-template-columns:{columns};height:{DAY_HEAD_PX}px">
          {#each days as day}
            {@const today = day.getTime() === todayStart}
            <div class="flex items-center justify-center gap-1 border-line border-l px-1 text-center">
              <span class="t-micro {today ? 'text-danger' : 'text-fg-faint'}">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                class="t-micro flex h-5 min-w-5 items-center justify-center rounded-md px-1 tabular-nums {today
                  ? 'bg-danger text-ink-fg'
                  : 'text-fg-muted'}"
              >
                {day.getDate()}
              </span>
            </div>
          {/each}
        </div>

        {#if allDayRows > 0}
          <div class="grid" style="grid-template-columns:{columns};height:{allDayRows * ALL_DAY_PX}px">
            <!-- Unkeyed, like the day headings: these are the columns' own cells, and moving DOM
                 nodes under a scroller resets the very scroll offset this grid is holding. -->
            {#each days as _, index}
              <div class="border-line border-l" style="grid-row:1 / span {allDayRows};grid-column:{index + 1}"></div>
            {/each}
            {#each drawnAllDay as span (span.event.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="relative py-0.5"
                style="grid-row:{span.row + 1};grid-column:{span.dayIndex + 1} / span {span.days}"
                in:fade={{ duration: theme.reduceMotion ? 0 : 150 }}
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
        onpointerup={(e) => {
          data.endMarquee();
          data.tapEmpty(e);
        }}
        onpointercancel={() => data.endMarquee()}
        class="relative grid"
        style="grid-template-columns:{columns};height:{24 *
          HOUR_PX}px;background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px {HOUR_PX}px)"
      >
        {#each days as day, index}
          {@const weekend = day.getDay() === 0 || day.getDay() === 6}
          <div class="relative snap-start border-line border-l {weekend ? 'bg-fg/[0.02]' : ''}">
            <!-- The column itself is a fixed slot that always exists — it's what the scroll offset
                 is measured in. Only its blocks come and go with the window. -->
            {#each isDrawn(index) ? placedByDay[index] : [] as segment (segment.event.id)}
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
                in:fade={{ duration: theme.reduceMotion ? 0 : 150 }}
                onpointerdown={(e) => data.beginMove(segment.event, e)}
                onpointermove={(e) => data.moveDrag(e)}
                onpointerup={(e) => data.endDrag(e)}
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
                    onpointerup={(e) => data.endDrag(e)}
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
                    onpointerup={(e) => data.endDrag(e)}
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
          <!-- Where the block will land once let go — snapped, not where it's held. A drag that
               reaches past midnight lands as one rectangle per day it covers. -->
          {#each daySpans(data.drag.startMinutes, data.drag.endMinutes) as span (span.dayOffset)}
            <div
              class="pointer-events-none absolute z-40 rounded-sm border-2 border-fg/50 border-dashed"
              style="left:{(snappedIndex + span.dayOffset) * dayWidth +
                (ghostLeftPercent / 100) * dayWidth}px;width:{(ghostWidthPercent / 100) * dayWidth -
                10}px;top:{(span.startMinutes / 60) * HOUR_PX}px;height:{((span.endMinutes - span.startMinutes) / 60) *
                HOUR_PX}px"
            ></div>
          {/each}
        {/if}

        {#if ghostEvent && data.drag}
          <!-- The block itself, following the pointer unsnapped on both axes, split the same way. -->
          {@const ghostSpans = daySpans(data.drag.freeStartMinutes, data.drag.freeEndMinutes)}
          {#each ghostSpans as span, i (span.dayOffset)}
            <div
              class="pointer-events-none absolute z-40"
              style="left:{(data.drag.freeDayIndex + span.dayOffset) * dayWidth +
                (ghostLeftPercent / 100) * dayWidth}px;width:{(ghostWidthPercent / 100) * dayWidth -
                10}px;top:{(span.startMinutes / 60) * HOUR_PX}px;height:{((span.endMinutes - span.startMinutes) / 60) *
                HOUR_PX}px"
            >
              <EventBlock
                event={ghostEvent}
                {categories}
                ghost
                narrow
                flatTop={i > 0}
                flatBottom={i < ghostSpans.length - 1}
              />
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
  </div>
</div>

{#if data.contextMenuEvent && data.contextMenuRect}
  <EventContextMenu event={data.contextMenuEvent} rect={data.contextMenuRect} categories={[...categories.values()]} />
{/if}

<SeriesEditPrompt />
