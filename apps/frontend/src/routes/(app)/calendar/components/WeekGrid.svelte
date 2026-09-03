<script lang="ts">
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { clock } from "$lib/clock.svelte";
  import { addDays, minutesIntoDay, startOfDay } from "$lib/dates";
  import { type CalendarEvent, type Category, NOT_A_MEETING } from "$lib/types";
  import { calendarData, STRIP_DAYS } from "$lib/calendar/calendar-data.svelte";
  import { Button } from "$lib/components";
  import { LocateFixed } from "lucide-svelte";
  import EventBlock from "./EventBlock.svelte";
  import { fade, fly } from "svelte/transition";
  import { untrack } from "svelte";
  import EventContextMenu from "./EventContextMenu.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { freeScroll, onWheelGesture, wheelGestureActive } from "$lib/calendar/free-scroll";
  import { pinch } from "$lib/calendar/pinch";
  import { anchoredScrollTop, timeScale } from "$lib/calendar/time-scale.svelte";
  import { theme } from "$lib/theme.svelte";
  import { viewport } from "$lib/viewport.svelte";
  import SeriesEditPrompt from "./SeriesEditPrompt.svelte";
  import { decisionMarkers } from "$lib/calendar/markers";
  import { projects, stages } from "$lib/synced.svelte";
  import { Flag, Minus, Plus } from "lucide-svelte";
  import TimeZonePicker from "./TimeZonePicker.svelte";
  import { preferences } from "$lib/preferences.svelte";
  import { deviceTimeZone } from "$lib/planning/zone";
  import { offsetMinutes, shortZoneName } from "$lib/time-zones";
  import {
    allDaySpansForRange,
    BLOCK_GUTTER_PX,
    daySpans,
    gridLines,
    gutterTicks,
    NARROW_BLOCK_PX,
    OPENING_HOUR,
    placeDay,
    resizeBands,
    type PlacedSegment,
    type Segment,
    segmentsForRange,
  } from "$lib/calendar/week-grid";

  /**
   * Days of hours — a week of them on a wide screen, three on a phone — with a week either side a
   * swipe away, so scrolling sideways is how the days change and the grid never spends a corner on
   * arrows. Twenty-one columns are drawn and `VISIBLE_DAYS` of them fit; coming to rest on a column
   * makes it the first day on screen, and the strip re-centres under it, so the scroll can go on
   * forever in either direction.
   *
   * Events are absolutely positioned inside their day column rather than laid out by the grid,
   * because two events at the same hour have to sit beside each other — something no row-based
   * layout can express.
   */
  let { categories }: { categories: Map<string, Category> } = $props();

  const data = calendarData;

  /** An hour's height, as the pinch has left it — the one length everything vertical is drawn in. */
  const hourPx = $derived(timeScale.hourPx);
  /**
   * The rules behind the day, as one background rather than a node per line per column. Pinching in
   * adds the half-hour and then the quarter-hour, each fainter than the division above it, so the
   * eye still reads the hours first.
   */
  const gridImage = $derived(
    gridLines(hourPx)
      .map(
        (line) =>
          `repeating-linear-gradient(to bottom,${
            line.mix === 100 ? "var(--line)" : `color-mix(in oklab,var(--line) ${line.mix}%,transparent)`
          } 0 1px,transparent 1px ${(line.minutes / 60) * hourPx}px)`,
      )
      .join(","),
  );
  /** One column of hours per zone. Narrower on a phone, where every pixel it gives up is a pixel of day. */
  const ZONE_COLUMN_PX = $derived(viewport.md ? 56 : 48);
  /** How many zones the grid will name its hours in — past this the days have no room left. */
  const MAX_ZONE_COLUMNS = 5;
  const zoneColumns = $derived(preferences.zoneColumns);
  const GUTTER_PX = $derived(ZONE_COLUMN_PX * zoneColumns.length);
  /**
   * The moment the columns are read at, since the gap between two zones moves with the clocks: the
   * first day on screen, at midday, so a week with a clock change in it is named as of its start.
   */
  const zoneAt = $derived.by(() => {
    const at = addDays(data.stripStart, liveDayOffset);
    at.setHours(12);
    return at;
  });
  /**
   * The hours' columns, one per zone, each naming as many of the rules behind the grid as there is
   * room for — the same ticks, read on another clock.
   */
  const zoneTicks = $derived(
    zoneColumns.map((zone) => ({
      zone,
      label: shortZoneName(zone, zoneAt),
      ticks: gutterTicks(hourPx, offsetMinutes(zone, zoneAt) - offsetMinutes(deviceTimeZone(), zoneAt)),
    })),
  );
  /** Which column's zone is being picked, and where the picker hangs. */
  let zonePick = $state<{ index: number; rect: DOMRect } | null>(null);

  function chooseZone(zone: string) {
    if (!zonePick) return;
    preferences.setZoneColumns(zoneColumns.map((one, index) => (index === zonePick?.index ? zone : one)));
    zonePick = null;
  }

  function addZoneColumn() {
    if (!zonePick) return;
    const index = zonePick.index + 1;
    preferences.setZoneColumns([...zoneColumns.slice(0, index), zoneColumns[zonePick.index], ...zoneColumns.slice(index)]);
    zonePick = { index, rect: zonePick.rect };
  }

  function removeZoneColumn() {
    if (!zonePick) return;
    preferences.setZoneColumns(zoneColumns.filter((_, index) => index !== zonePick?.index));
    zonePick = null;
  }
  const DAY_HEAD_PX = 28;
  const ALL_DAY_PX = 28;
  /** Three columns on a phone, a week on a wide screen — see `CalendarData.visibleDays`. */
  const VISIBLE_DAYS = $derived(data.visibleDays);
  /** How long the scroll has to sit still before it counts as having landed on a day. */
  const SETTLE_MS = 120;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const JUMP_ANIMATE_MS = 300;
  /** A settle is a nudge onto the nearest column, not a journey across the strip. */
  const SNAP_ANIMATE_MS = 200;

  let viewWidth = $state(0);
  let viewHeight = $state(0);
  let settle: ReturnType<typeof setTimeout> | null = null;
  /** Which strip the current scroll offset was measured against, and whether it's been placed yet. */
  let stripAt: number | null = null;
  /**
   * The first day on screen as of the last placement. The scroll offset can't stand in for it: the
   * strip recentres on every week change, so a jump of one day and a jump of six weeks can both
   * leave `scrollLeft` exactly where it was. This is the only thing that knows which way the window
   * went, and how far.
   */
  let windowAt: number | null = null;
  let opened = false;
  /**
   * The leftmost column the scroll is over, updated as it moves — unlike `data.dayOffset`, live
   * mid-drag. Whole days rather than pixels: everything reading it only cares which columns are on
   * screen, and a pixel-accurate copy would re-run all of it on every frame of every scroll.
   */
  // Starts where the window already is, not at zero: the first paint happens before the effect that
  // places the scroll, and a zero here would have it draw the columns behind the ones on screen.
  let liveDayOffset = $state(data.dayOffset);
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
  /** How far the days start out of place, in pixels: the distance the window actually moved, capped
   *  at a week — past that the columns are all new anyway and further would only slide for longer. */
  let easeDistance = $state(0);

  const dayWidth = $derived(Math.max(0, viewWidth - GUTTER_PX) / VISIBLE_DAYS);
  const columns = $derived(`repeat(${STRIP_DAYS},${dayWidth}px)`);
  const days = $derived(Array.from({ length: STRIP_DAYS }, (_, i) => addDays(data.stripStart, i)));

  /**
   * How far past the columns on screen the blocks are actually drawn. The strip is wide so a fling
   * always has columns ahead of it, but only the days near the window are worth building: the rest
   * would be a few hundred absolutely-positioned nodes nobody can see, rebuilt on every write.
   * Three days of margin covers the columns a fling exposes between two scroll ticks.
   */
  const DRAW_MARGIN_DAYS = 3;
  const firstDrawn = $derived(Math.max(0, liveDayOffset - DRAW_MARGIN_DAYS));
  const lastDrawn = $derived(Math.min(STRIP_DAYS - 1, liveDayOffset + VISIBLE_DAYS - 1 + DRAW_MARGIN_DAYS));
  const isDrawn = (index: number) => index >= firstDrawn && index <= lastDrawn;
  /** The columns the window is actually over, as against the runway either side of them. */
  const inWindow = (index: number) => index >= liveDayOffset && index < liveDayOffset + VISIBLE_DAYS;

  /**
   * Blocks that have been on screen at least once. A column's blocks are only built while it is near
   * the window and are thrown away behind it, and the strip re-buckets every one of them each time
   * it rebuilds a week over — so scrolling makes and unmakes the same events again and again, and
   * fading each of those in is what made the week look like it was refetching itself.
   */
  const seen = new Set<string>();

  /**
   * A column's blocks. The runway — the days built ahead of the window so a fling has something to
   * scroll onto — carries only blocks that have already had their moment: an event nobody has seen
   * yet waits until its column is really on screen, so that its fade happens where it can be
   * watched instead of three days out of view.
   */
  function blocksFor(index: number): PlacedSegment[] {
    if (!isDrawn(index)) return [];
    const placed = placedByDay[index] ?? [];
    return inWindow(index) ? placed : placed.filter((segment) => seen.has(segment.event.id));
  }

  /**
   * Fades a block in the first time that event is drawn — arriving from the calendar, or made by a
   * drag — and never again, so scrolling back over a week costs no animation.
   */
  function appear(node: Element, { id }: { id: string }) {
    const first = !seen.has(id);
    seen.add(id);
    return first && !theme.reduceMotion ? fade(node, { duration: 150 }) : {};
  }

  /** Bucketed in one pass rather than a filter per column, which would walk the whole strip's
   *  segments once per column for every change to the events behind them. */
  const placedByDay = $derived.by(() => {
    const byDay: Segment[][] = Array.from({ length: STRIP_DAYS }, () => []);
    for (const segment of segmentsForRange(data.events, data.stripStart, STRIP_DAYS)) {
      byDay[segment.dayIndex]?.push(segment);
    }
    return byDay.map((segments) => placeDay(segments, hourPx, dayWidth));
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
  const ghostWidth = $derived(draggedSegment?.width ?? dayWidth - BLOCK_GUTTER_PX);
  const ghostLeft = $derived(draggedSegment?.left ?? 0);
  const allDay = $derived(allDaySpansForRange(data.events, data.stripStart, STRIP_DAYS));
  /** Rows are reserved for the whole strip, so a banner keeps its row as it scrolls in — but only
   *  the banners near the window are built, the same way the blocks below them are. */
  const drawnAllDay = $derived(
    allDay.filter(
      (span) =>
        span.dayIndex + span.days > firstDrawn &&
        span.dayIndex <= lastDrawn &&
        // Same rule as the blocks below: a banner nobody has seen waits for the window rather than
        // spending its fade on the runway.
        (seen.has(span.event.id) ||
          (span.dayIndex + span.days > liveDayOffset && span.dayIndex < liveDayOffset + VISIBLE_DAYS)),
    ),
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
  /**
   * The projects' days on the strip: a decision day as a flag, a checkpoint as a tick. They take a
   * row of their own under the banners, only when one of them is on the days in view.
   */
  const markers = $derived(decisionMarkers(stages.all, projects.all, [...categories.values()], data.stripStart, STRIP_DAYS));
  const markerRows = $derived(
    markers.some((m) => m.dayIndex >= liveDayOffset && m.dayIndex < liveDayOffset + VISIBLE_DAYS) ? 1 : 0,
  );
  const drawnMarkers = $derived(markers.filter((m) => m.dayIndex >= firstDrawn && m.dayIndex <= lastDrawn));
  const headerPx = $derived(DAY_HEAD_PX + (allDayRows + markerRows) * ALL_DAY_PX);

  const todayStart = $derived(clock.todayStart);
  const nowTop = $derived((minutesIntoDay(clock.now) / 60) * hourPx);
  /**
   * Whether today's column sits outside the days currently on screen. Measured against the
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
    const top = (Math.min(box.fromMinutes, box.toMinutes) / 60) * hourPx;
    return {
      left,
      top,
      width: Math.abs(box.toDay - box.fromDay) * dayWidth,
      height: (Math.abs(box.toMinutes - box.fromMinutes) / 60) * hourPx,
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

  // Opens on the working day, with the window's first day against the hours. Re-runs on a resize
  // (a different column width means the same offset points at a different day) and whenever the
  // window jumps programmatically (goToToday, goToDay from outside a swipe).
  $effect(() => {
    const scroller = data.scrollerEl;
    const width = dayWidth;
    const offset = data.dayOffset;
    const start = data.stripStart.getTime();
    const windowDay = data.windowStart.getTime();
    if (!scroller || width === 0) return;
    // Days the window moved, signed. A jump that lands on the week already on screen moves nothing,
    // and has nothing to animate — see `#jumpTo`, which is why that shouldn't happen at all.
    const moved = windowAt === null ? 0 : Math.round((windowDay - windowAt) / MS_PER_DAY);
    // Read without subscribing, and cleared however this run ends: the flag belongs to the window
    // move that raised it, and re-running this effect for the clearing alone would only re-place a
    // scroll that is already where it belongs.
    const jump = untrack(() => data.animateNextJump) && moved !== 0;
    data.animateNextJump = false;

    if (jump) {
      // Everything here is synchronous, and that is the point. The strip has just moved a whole
      // number of weeks under the scroll, and the effect below is about to walk `scrollLeft` back by
      // exactly that much to keep the columns still — which is right for a swipe and wrong for a
      // jump, whose whole business is landing on a different week. Claiming `stripAt` now, in this
      // same flush, is what tells it this shift has already been accounted for. Deferring any of it
      // to a frame from now is what put the week one column-run out.
      cancelAnimation();
      if (settle) clearTimeout(settle);
      settle = null;
      jumping = true;
      scroller.scrollLeft = offset * width;
      liveDayOffset = offset;
      followingScroll = false;
      stripAt = start;
      windowAt = windowDay;
      // The strip often recentres on the same offset, so there may be no distance here for
      // `scrollLeft` itself to ease across — see the note by `easing` above.
      if (theme.reduceMotion) {
        jumping = false;
        return;
      }
      easeDirection = moved < 0 ? -1 : 1;
      easeDistance = Math.min(Math.abs(moved), VISIBLE_DAYS) * width;
      easing = true;
      const slide = requestAnimationFrame(() => (easing = false));
      // The jump owns the grid until the slide is over, not just for the frame that starts it: the
      // scroll it wrote is still being reported — a snap container re-snaps after every programmatic
      // write — and a settle taking one of those late ticks for a gesture would move the window off
      // the week that was asked for.
      const held = setTimeout(() => (jumping = false), JUMP_ANIMATE_MS);
      return () => {
        cancelAnimationFrame(slide);
        clearTimeout(held);
        easing = false;
        jumping = false;
      };
    }

    // Next frame: the columns have to be laid out at their new width before an offset into them
    // means anything — set it too early and the browser clamps it to a scroll range of zero.
    const frame = requestAnimationFrame(() => {
      if (!opened) scroller.scrollTop = OPENING_HOUR * timeScale.hourPx;
      opened = true;
      if (!jumping && !followingScroll) {
        // Only when the scroll isn't already on the column: a settle that landed dead-on would
        // otherwise take a second, redundant write a frame later.
        if (Math.abs(scroller.scrollLeft - offset * width) >= 1) scroller.scrollLeft = offset * width;
        liveDayOffset = offset;
      }
      followingScroll = false;
      stripAt = start;
      windowAt = windowDay;
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
    // A jump has already placed the scroll for this shift and moved `stripAt` on to it, so there's
    // nothing here to walk back — see the effect above.
    if (!scroller || stripAt === null || start === stripAt) return;
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
    // A jump is already driving the scroll to a column of its own. Landing here would read the
    // position it is on its way from and move the window back to it, undoing the jump.
    if (jumping) return;
    if (!scroller || dayWidth === 0 || data.drag) return land();
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
    if (!scroller || dayWidth === 0 || data.drag || jumping) return;
    const shift = Math.round(scroller.scrollLeft / dayWidth) - data.dayOffset;
    if (shift === 0) return;
    // The window is following the scroll, not leading it: the effect above must leave the position
    // alone, or a mid-fling recentre would write the scroll back and stop the week dead.
    followingScroll = true;
    data.goToDay(shift);
  }

  /**
   * The pinch, both kinds of it. Only the vertical scale moves: the columns are days, and a week is
   * a week however closely you look at it.
   *
   * The scroll is written back on every step so the time between the fingers stays between them —
   * without it the grid grows from its top edge and the hour being looked at slides off the screen.
   * Whatever the fingers landed on first is dropped: a second finger arriving on a block is the
   * start of a pinch, not the drag that one finger had begun to look like.
   */
  const pinchTarget = {
    start: () => {
      data.abortGesture();
      timeScale.beginPinch();
    },
    move: (scale: number, centreY: number) => {
      const scroller = data.scrollerEl;
      const ratio = timeScale.pinchTo(scale);
      if (!scroller || ratio === 1) return;
      const top = scroller.getBoundingClientRect().top;
      scroller.scrollTop = anchoredScrollTop(scroller.scrollTop, centreY - top, headerPx, ratio);
    },
    end: () => timeScale.endPinch(),
  };

  // The day has to fill the window and never fall short of it, so the smallest scale is worked out
  // from the height the hours are actually drawn in — the scroller, less the header over them.
  $effect(() => timeScale.fit(viewHeight - headerPx));

  $effect(() => timeScale.start());

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
          class="gap-1.5 rounded-full py-1.5 shadow-(--shadow-float)"
        >
          {#snippet icon()}
            <LocateFixed size={14} />
          {/snippet}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Snapping is off for the length of a jump. The slide below moves the columns with a transform,
       and a snap container measures its snap points off the transformed boxes: left on, it would
       take the days' displaced positions for the real ones and re-snap the scroll a whole week away
       from the one that was asked for. It comes back on once the slide is over, on the column the
       jump landed on. -->
  <div
    bind:this={data.scrollerEl}
    bind:clientWidth={viewWidth}
    bind:clientHeight={viewHeight}
    use:freeScroll
    use:pinch={pinchTarget}
    {onscroll}
    style="scroll-padding-left:{GUTTER_PX}px"
    class="no-scrollbar h-full overflow-auto overscroll-none bg-surface"
    class:snap-x={!jumping}
    class:snap-proximity={!jumping}
  >
  <div class="flex" style="width:{GUTTER_PX + STRIP_DAYS * dayWidth}px">
    <!-- The hours stay put while the days slide past them — a column of them per zone. -->
    <div class="sticky left-0 z-30 flex shrink-0 border-line border-r bg-surface" style="width:{GUTTER_PX}px">
      {#each zoneTicks as column, index (index)}
        <div class="flex shrink-0 flex-col {index > 0 ? 'border-line border-l' : ''}" style="width:{ZONE_COLUMN_PX}px">
          <div
            class="sticky top-0 z-10 flex shrink-0 items-end justify-center border-line border-b bg-surface pb-0.5 transition-[height] duration-150"
            style="height:{headerPx}px"
          >
            <!-- A rung smaller on a phone, where the gutter is narrower than the label it carries. -->
            <button
              type="button"
              title={column.zone}
              aria-label="Time zone: {column.zone}"
              onclick={(e) => (zonePick = { index, rect: e.currentTarget.getBoundingClientRect() })}
              class="hoverable {viewport.md ? 't-data-micro' : 't-data-nano'} max-w-full truncate rounded-md px-1 {zonePick?.index === index
                ? 'text-fg'
                : 'text-fg-faint'}"
            >
              {column.label}
            </button>
          </div>
          <div class="relative" style="height:{24 * hourPx}px">
            {#each column.ticks as tick (tick.minutes)}
              <!-- A division between the hours is drawn quieter than they are, the same way its line is. -->
              <div
                class="absolute right-2 -translate-y-1/2 text-fg-faint {tick.major
                  ? 't-data-micro'
                  : 't-data-nano opacity-55'}"
                style="top:{(tick.minutes / 60) * hourPx}px"
              >
                {tick.label}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <div
      class="min-w-0"
      style="transition:{easing ? 'none' : `transform ${JUMP_ANIMATE_MS}ms ease-out`};transform:translateX({easing
        ? easeDirection * easeDistance
        : 0}px)"
    >
      <div class="sticky top-0 z-20 border-line border-b bg-surface transition-[height] duration-150" style="height:{headerPx}px">
        <!-- Unkeyed: the columns are fixed slots the days move through, and moving DOM nodes
             under a scroller resets the very scroll offset this grid is holding. -->
        <div class="grid" style="grid-template-columns:{columns};height:{DAY_HEAD_PX}px">
          {#each days as day}
            {@const today = day.getTime() === todayStart}
            {@const planning = planMode.isDay(day)}
            <div
              class="flex items-center justify-center gap-1 border-line border-l px-1 text-center {planning
                ? 'plan-day'
                : ''}"
            >
              <span class="t-micro {today ? 'text-danger' : 'text-fg-faint'}">
                {day.toLocaleDateString(undefined, { weekday: viewport.md ? "short" : "long" })}
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

        {#if markerRows > 0}
          <div class="grid" style="grid-template-columns:{columns};height:{ALL_DAY_PX}px">
            {#each days as _, index}
              <div class="border-line border-l" style="grid-row:1;grid-column:{index + 1}"></div>
            {/each}
            {#each drawnMarkers as marker (marker.key)}
              <a
                href="/projects/{marker.projectId}"
                title={marker.label}
                class="t-micro relative flex min-w-0 items-center gap-1 self-center truncate rounded-sm px-1 py-px
                  {marker.kind === 'decision' ? 'text-fg' : 'text-fg-muted'}"
                style="grid-row:1;grid-column:{marker.dayIndex + 1};margin-right:{BLOCK_GUTTER_PX}px;{marker.kind === 'decision'
                  ? `background:color-mix(in oklab,${marker.color} 18%,transparent)`
                  : ''}"
              >
                {#if marker.kind === "decision"}
                  <Flag size={10} style="color:{marker.color}" class="shrink-0" />
                {:else}
                  <span class="size-1.5 shrink-0 rounded-full" style="background:{marker.color}"></span>
                {/if}
                <span class="truncate">{marker.label}</span>
              </a>
            {/each}
          </div>
        {/if}

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
                style="margin-right:{BLOCK_GUTTER_PX}px;grid-row:{span.row + 1};grid-column:{span.dayIndex + 1} / span {span.days}"
                in:appear={{ id: span.event.id }}
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
        style="grid-template-columns:{columns};height:{24 * hourPx}px;background-image:{gridImage}"
      >
        {#each days as day, index}
          {@const weekend = day.getDay() === 0 || day.getDay() === 6}
          <div class="relative snap-start border-line border-l {weekend ? 'bg-fg/[0.02]' : ''}">
            <!-- The column itself is a fixed slot that always exists — it's what the scroll offset
                 is measured in. Only its blocks come and go with the window. -->
            {#each blocksFor(index) as segment (segment.event.id)}
              <!-- Alt held: the original stays put in full, since the pointer is dragging a copy. -->
              {@const dragging = data.drag?.event?.id === segment.event.id && !data.drag?.copy}
              <!-- The rest of a dragged batch stays where it is, faded, with its target outlined. -->
              {@const trailing =
                !data.drag?.copy && (data.drag?.others.some((other) => other.id === segment.event.id) ?? false)}
              <!-- A block sits over the ones it collides with, and the open block over everything,
                   so what you're working on is what the pointer finds — including its handles,
                   which may hang outside a short block. -->
              {@const isSelected = data.selected?.id === segment.event.id}
              <!-- Resize bands sized off the drawn height, so the two can never meet and never eat
                   the middle, which is what opens the event. -->
              {@const bands = resizeBands(segment.height, isSelected)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                data-event
                class="absolute touch-none select-none {dragging ? 'opacity-0' : trailing ? 'opacity-40' : ''}"
                style="top:{segment.top}px;height:{segment.height}px;left:{segment.left}px;width:{segment.width}px;z-index:{isSelected
                  ? 30
                  : segment.depth}"
                in:appear={{ id: segment.event.id }}
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
                  narrow={segment.width < NARROW_BLOCK_PX}
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
                ghostLeft}px;width:{ghostWidth}px;top:{(span.startMinutes / 60) * hourPx}px;height:{((span.endMinutes - span.startMinutes) / 60) *
                hourPx}px"
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
                ghostLeft}px;width:{ghostWidth}px;top:{(span.startMinutes / 60) * hourPx}px;height:{((span.endMinutes - span.startMinutes) / 60) *
                hourPx}px"
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

{#if zonePick}
  <TimeZonePicker
    rect={zonePick.rect}
    value={zoneColumns[zonePick.index]}
    at={zoneAt}
    onchoose={chooseZone}
    onclose={() => (zonePick = null)}
  >
    {#snippet footer()}
      {#if zoneColumns.length < MAX_ZONE_COLUMNS}
        <button
          type="button"
          onclick={addZoneColumn}
          class="hoverable flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
        >
          <Plus size={14} class="shrink-0 text-fg-faint" />
          <span class="t-body text-fg">Add another zone</span>
        </button>
      {/if}
      {#if zoneColumns.length > 1}
        <button
          type="button"
          onclick={removeZoneColumn}
          class="hoverable flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
        >
          <Minus size={14} class="shrink-0 text-fg-faint" />
          <span class="t-body text-fg">Remove this column</span>
        </button>
      {/if}
    {/snippet}
  </TimeZonePicker>
{/if}

<style>
  /**
   * The day being planned, breathing.
   *
   * On the heading rather than down the column: a glow behind twelve hours of blocks makes the
   * blocks harder to read, and the heading is where the eye goes to answer "which day is this".
   */
  .plan-day {
    animation: plan-pulse 2.4s ease-in-out infinite;
    border-radius: 0.375rem;
  }

  @keyframes plan-pulse {
    0%,
    100% {
      background-color: color-mix(in oklab, var(--color-cyan-400) 12%, transparent);
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-cyan-400) 30%, transparent);
    }
    50% {
      background-color: color-mix(in oklab, var(--color-cyan-400) 22%, transparent);
      box-shadow: 0 0 12px 2px color-mix(in oklab, var(--color-cyan-400) 22%, transparent);
    }
  }

  /* A pulse that never stops is a problem for anyone who asked the system to stop them. */
  @media (prefers-reduced-motion: reduce) {
    .plan-day {
      animation: none;
      background-color: color-mix(in oklab, var(--color-cyan-400) 18%, transparent);
    }
  }
</style>
