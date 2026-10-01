<script lang="ts">
  import { preferences } from "$lib/account/preferences.svelte";
  import { calendarData, STRIP_DAYS } from "$lib/calendar/calendar-data.svelte";
  import { addDays } from "$lib/calendar/dates";
  import { freeScroll } from "$lib/calendar/free-scroll";
  import { dueMarkers } from "$lib/calendar/markers";
  import { pinch } from "$lib/calendar/pinch";
  import { anchoredScrollTop, timeScale } from "$lib/calendar/time-scale.svelte";
  import {
    allDayRowCount,
    allDaySpansForRange,
    blocksFor,
    gridLines,
    inWindow,
    marqueeBox,
    placeStrip,
    spansPerDay,
    type StripWindow,
  } from "$lib/calendar/week-grid";
  import type { Category } from "$lib/core/records";
  import { readSetting, writeSetting } from "$lib/core/persist";
  import { projects, stages, tasks } from "$lib/core/synced.svelte";
  import { clock } from "$lib/platform/clock.svelte";
  import { viewport } from "$lib/platform/viewport.svelte";
  import { theme } from "$lib/ui/theme.svelte";
  import { ChevronDown, ChevronUp } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import AllDayRow, { ALL_DAY_PX, DAY_HEAD_PX } from "./AllDayRow.svelte";
  import DayColumn from "./DayColumn.svelte";
  import DayHeadings from "./DayHeadings.svelte";
  import DragGhost from "./DragGhost.svelte";
  import EventContextMenu from "./EventContextMenu.svelte";
  import SeriesDeletePrompt from "./SeriesDeletePrompt.svelte";
  import SeriesEditPrompt from "./SeriesEditPrompt.svelte";
  import TodayButton from "./TodayButton.svelte";
  import { JUMP_ANIMATE_MS, WeekScroll } from "./week-scroll.svelte";
  import ZoneGutter from "./ZoneGutter.svelte";

  /**
   * Days of hours — a week of them on a wide screen, three on a phone — with a week either side a
   * swipe away, so scrolling sideways is how the days change and the grid never spends a corner on
   * arrows. This is the shell: it works out which columns the window is over and hands each part
   * its slice — the hours down the side (`ZoneGutter`), the banners over the days (`AllDayRow`),
   * a `DayColumn` per day, and what a drag draws (`DragGhost`). The scroll itself is `WeekScroll`.
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
  const GUTTER_PX = $derived(ZONE_COLUMN_PX * preferences.zoneColumns.length);

  const scroll = new WeekScroll(() => GUTTER_PX);
  onDestroy(() => scroll.destroy());

  const dayWidth = $derived(scroll.dayWidth);
  const columns = $derived(`repeat(${STRIP_DAYS},${dayWidth}px)`);
  const days = $derived(Array.from({ length: STRIP_DAYS }, (_, i) => addDays(data.stripStart, i)));
  /** The columns the scroll is over right now, live mid-drag — see `WeekScroll.liveDayOffset`. */
  const window = $derived<StripWindow>({
    offset: scroll.liveDayOffset,
    visibleDays: data.visibleDays,
    stripDays: STRIP_DAYS,
  });
  /**
   * The moment the zone columns are read at, since the gap between two zones moves with the
   * clocks: the first day on screen, at midday, so a week with a clock change in it is named as
   * of its start.
   */
  const zoneAt = $derived.by(() => {
    const at = addDays(data.stripStart, window.offset);
    at.setHours(12);
    return at;
  });

  /**
   * Blocks that have been on screen at least once. A column's blocks are only built while it is near
   * the window and are thrown away behind it, and the strip re-buckets every one of them each time
   * it rebuilds a week over — so scrolling makes and unmakes the same events again and again, and
   * fading each of those in is what made the week look like it was refetching itself.
   */
  const seen = new Set<string>();

  /**
   * Fades a block in the first time that event is drawn — arriving from the calendar, or made by a
   * drag — and never again, so scrolling back over a week costs no animation.
   */
  function appear(node: Element, { id }: { id: string }) {
    // A draft getting its real id is the same block under a new key, not a block arriving.
    const first = !seen.has(id) && !data.wasDraft(id);
    seen.add(id);
    return first && !theme.reduceMotion ? fade(node, { duration: 150 }) : {};
  }

  const placedByDay = $derived(placeStrip(data.events, data.stripStart, STRIP_DAYS, hourPx, dayWidth));
  const allDay = $derived(allDaySpansForRange(data.events, data.stripStart, STRIP_DAYS));
  /** The projects' days on the strip, rows of their own above the banners. */
  const markers = $derived(dueMarkers(stages.all, tasks.all, projects.all, [...categories.values()], data.stripStart, STRIP_DAYS));
  /**
   * Folded, the header is one row saying how many banners and project days each day holds — a
   * week of long tasks would otherwise push the hours off the screen. It is this device's choice,
   * since a phone and a desktop have different room.
   */
  const FOLD_KEY = "calendar.allDayFolded";
  let folded = $state(readSetting<boolean>(FOLD_KEY) ?? false);
  function toggleFold() {
    folded = !folded;
    writeSetting(FOLD_KEY, folded);
  }
  /** Only the spans touching the days on screen reserve rows, so the header follows the live scroll. */
  const allDayRows = $derived(allDayRowCount(allDay, window));
  const markerRows = $derived(allDayRowCount(markers, window));
  /** Folding is offered once the header holds more than the one row it folds to. */
  const foldable = $derived(allDayRows + markerRows > 1);
  const showFolded = $derived(folded && foldable);
  const counts = $derived({ events: spansPerDay(allDay, STRIP_DAYS), tasks: spansPerDay(markers, STRIP_DAYS) });
  const headerPx = $derived(DAY_HEAD_PX + (showFolded ? 1 : allDayRows + markerRows) * ALL_DAY_PX);

  const todayStart = $derived(clock.todayStart);
  const marquee = $derived(data.marquee ? marqueeBox(data.marquee, hourPx, dayWidth) : null);

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
  $effect(() => timeScale.fit(scroll.viewHeight - headerPx));

  $effect(() => timeScale.start());

  // A hard press on a Mac trackpad draws a block the way a double click does. WebKit's own
  // events, so they are wired by name rather than as attributes; the first one is cancelled to
  // keep the system's Look Up panel off the grid.
  $effect(() => {
    const el = data.columnsEl;
    if (!el) return;
    const willBegin = (e: Event) => e.preventDefault();
    const down = (e: Event) => data.forcePress(e as MouseEvent);
    el.addEventListener("webkitmouseforcewillbegin", willBegin);
    el.addEventListener("webkitmouseforcedown", down);
    return () => {
      el.removeEventListener("webkitmouseforcewillbegin", willBegin);
      el.removeEventListener("webkitmouseforcedown", down);
    };
  });
</script>

<div class="relative h-full">
  <TodayButton jumping={scroll.jumping} />

  <!-- Over the top-right corner of the days rather than inside the strip, so it stays put while
       the days slide under it. -->
  {#if foldable}
    <button
      type="button"
      onclick={toggleFold}
      aria-label={folded ? "Show every all-day row" : "Fold the all-day rows"}
      aria-expanded={!folded}
      class="bare-button absolute right-1 z-30 size-6 bg-surface"
      style="top:{(DAY_HEAD_PX - 24) / 2}px"
    >
      {#if folded}<ChevronDown size={14} />{:else}<ChevronUp size={14} />{/if}
    </button>
  {/if}

  <!-- No CSS snapping: a snap container turns a fling into the browser's own animation to a fixed
       offset, which overwrites the strip's recentre underneath it and runs the week away (see
       `WeekScroll`). The grid's own settle eases onto a column instead. -->
  <div
    bind:this={data.scrollerEl}
    bind:clientWidth={scroll.viewWidth}
    bind:clientHeight={scroll.viewHeight}
    use:freeScroll
    use:pinch={pinchTarget}
    onscroll={scroll.onscroll}
    class="no-scrollbar h-full overflow-auto overscroll-none bg-surface"
  >
    <div class="flex" style="width:{GUTTER_PX + STRIP_DAYS * dayWidth}px">
      <!-- The hours stay put while the days slide past them — a column of them per zone. -->
      <ZoneGutter {hourPx} {headerPx} columnPx={ZONE_COLUMN_PX} {zoneAt} />

      <div
        class="min-w-0"
        style="transition:{scroll.easing ? 'none' : `transform ${JUMP_ANIMATE_MS}ms ease-out`};transform:translateX({scroll.slidePx}px)"
      >
        <div class="sticky top-0 z-20 border-line border-b bg-surface transition-[height] duration-150" style="height:{headerPx}px">
          <DayHeadings {days} {columns} {todayStart} height={DAY_HEAD_PX} />

          <AllDayRow
            {days}
            {columns}
            spans={allDay}
            {markers}
            rows={allDayRows}
            {markerRows}
            folded={showFolded ? counts : null}
            onunfold={toggleFold}
            {window}
            {seen}
            {appear}
            {categories}
          />
        </div>

        <!-- One background gradient rather than an hour line per row per day. It is a surface, not
             a control: a press on empty grid starts a gathering box or a new block, and there is no
             keyboard equivalent of dragging a rectangle — the card's fields are that. So it stays a
             plain div, hidden from the accessibility tree by having no role, and the lint is silenced
             rather than answered with a role it would be lying about. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={data.columnsEl}
          onpointerdown={(e) => data.beginMarquee(e)}
          onpointermove={(e) => data.moveMarquee(e)}
          onpointerup={(e) => data.endMarquee(e)}
          onpointercancel={() => data.endMarquee()}
          class="relative grid"
          style="grid-template-columns:{columns};height:{24 * hourPx}px;background-image:{gridImage}"
        >
          {#each days as day, index}
            <DayColumn
              {day}
              blocks={blocksFor(placedByDay[index], index, window, seen)}
              today={day.getTime() === todayStart}
              inWindow={inWindow(index, window)}
              {hourPx}
              {dayWidth}
              {appear}
              {categories}
            />
          {/each}

          {#if marquee}
            <div
              class="pointer-events-none absolute z-40 rounded-sm border border-fg/40 bg-fg/5"
              style="left:{marquee.left}px;top:{marquee.top}px;width:{marquee.width}px;height:{marquee.height}px"
            ></div>
          {/if}

          <DragGhost {hourPx} {dayWidth} {placedByDay} {categories} />
        </div>
      </div>
    </div>
  </div>
</div>

{#if data.contextMenuEvent && data.contextMenuRect}
  <EventContextMenu event={data.contextMenuEvent} rect={data.contextMenuRect} categories={[...categories.values()]} />
{/if}

<SeriesEditPrompt {categories} />
<SeriesDeletePrompt {categories} />
