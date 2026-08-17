<script lang="ts">
  import { addDays, startOfWeek } from "$lib/dates";
  import { theme } from "$lib/theme.svelte";
  import { ChevronDown, ChevronUp, Undo2 } from "lucide-svelte";
  import { untrack } from "svelte";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * The month as a picker: one continuous column of weeks that scrolls like any other list, six of
   * them in view at a time, the currently visible seven days washed with a plate and today in red.
   * Tapping a day jumps the main grid to the week it falls in; scrolling here only browses, so a
   * flick through the year doesn't drag the week grid along behind it.
   *
   * The month named above the grid is read back off the scroll position rather than held as its
   * own state — with a single strip of weeks there is no "displayed month" to keep in sync, only
   * whichever month the rows in view mostly belong to.
   */
  const data = calendarData;

  const VISIBLE_DAYS = 7;
  const VISIBLE_ROWS = 6;
  const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  /** Row geometry has to be known here, not just in CSS: the scroll position is what says which
   *  month is on screen, and the arrows scroll by whole rows. */
  const ROW_PX = 28;
  const GAP_PX = 2;
  const STRIDE_PX = ROW_PX + GAP_PX;
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  /** How far the strip reaches either side of the week it was built around — two years each way,
   *  far enough that scrolling never hits an end in a session. */
  const WEEKS_EITHER_SIDE = 52;

  const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = dayKey(new Date());

  /** The strip is laid out once around the week it opened on; every position is an offset from it. */
  const baseWeek = startOfWeek(data.weekStart);
  const weeks = Array.from({ length: WEEKS_EITHER_SIDE * 2 + 1 }, (_, i) =>
    addDays(baseWeek, (i - WEEKS_EITHER_SIDE) * 7),
  );

  const daysOf = (row: Date) => Array.from({ length: VISIBLE_DAYS }, (_, offset) => addDays(row, offset));

  const weekIndex = (date: Date) =>
    Math.round((startOfWeek(date).getTime() - baseWeek.getTime()) / MS_PER_WEEK) + WEEKS_EITHER_SIDE;

  let viewport = $state<HTMLElement>();
  let scrollTop = $state(0);

  /** The month of the row a third of the way down the viewport — the one the eye reads as "the"
   *  month when a boundary is on screen. */
  const displayedMonth = $derived.by(() => {
    const row = weeks[Math.min(weeks.length - 1, Math.round(scrollTop / STRIDE_PX) + 2)] ?? baseWeek;
    return monthStart(addDays(row, 3));
  });
  const monthLabel = $derived(displayedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
  /**
   * Whether today's row is one of the six on screen — which is what the button puts back, so it is
   * also what decides whether the button is there at all. The displayed month can't answer that:
   * scrolling to today's week leaves the month read off two rows further down, so a week at the end
   * of a month would land on the next one and leave the button offering a journey it just made.
   */
  const todayInView = $derived.by(() => {
    const first = Math.round(scrollTop / STRIDE_PX);
    const index = weekIndex(new Date());
    return index >= first && index < first + VISIBLE_ROWS;
  });

  // The strip always shows exactly seven consecutive days, but a swipe can land that window on
  // any weekday — not just a Monday — so it can cut across two of the grid's own Monday-start rows.
  const visibleStart = $derived(data.windowStart);
  const visibleEnd = $derived(addDays(visibleStart, VISIBLE_DAYS - 1));

  function visibleSpan(row: Date): { start: number; end: number } | null {
    let start = -1;
    let end = -1;
    for (let i = 0; i < VISIBLE_DAYS; i++) {
      const time = addDays(row, i).getTime();
      if (time < visibleStart.getTime() || time > visibleEnd.getTime()) continue;
      if (start === -1) start = i;
      end = i;
    }
    return start === -1 ? null : { start, end };
  }

  function scrollToRow(index: number, smooth = true) {
    viewport?.scrollTo({
      top: Math.max(0, index * STRIDE_PX),
      behavior: smooth && !theme.reduceMotion ? "smooth" : "auto",
    });
  }

  /** Follow the week grid only when it has moved out of sight — scrolling here is browsing, and
   *  yanking the strip back on every swipe elsewhere would fight the person doing it. The scroll
   *  position is read untracked, or scrolling away from the current week would pull it right back. */
  $effect(() => {
    const index = weekIndex(data.weekStart);
    untrack(() => {
      const first = Math.round((viewport?.scrollTop ?? 0) / STRIDE_PX);
      if (index >= first && index < first + VISIBLE_ROWS) return;
      scrollToRow(index - 1);
    });
  });

  $effect(() => {
    // The opening position: the current week one row down, so last week is still on screen.
    scrollToRow(WEEKS_EITHER_SIDE - 1, false);
  });

  function shiftMonth(delta: number) {
    const target = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + delta, 1);
    scrollToRow(weekIndex(target));
  }

  function backToToday() {
    scrollToRow(weekIndex(new Date()) - 1);
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between px-0.5">
    <span class="t-micro text-fg-muted">{monthLabel}</span>
    <div class="flex items-center gap-0.5">
      {#if !todayInView}
        <button
          type="button"
          aria-label="Back to today"
          onclick={backToToday}
          class="hoverable press-sm flex size-5 items-center justify-center rounded text-fg-faint"
        >
          <Undo2 size={12} />
        </button>
      {/if}
      <button
        type="button"
        aria-label="Previous month"
        onclick={() => shiftMonth(-1)}
        class="hoverable press-sm flex size-5 items-center justify-center rounded text-fg-faint"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        aria-label="Next month"
        onclick={() => shiftMonth(1)}
        class="hoverable press-sm flex size-5 items-center justify-center rounded text-fg-faint"
      >
        <ChevronDown size={12} />
      </button>
    </div>
  </div>

  <div class="grid grid-cols-7">
    {#each WEEKDAY_LABELS as label (label)}
      <span class="t-micro pb-1 text-center text-fg-faint">{label}</span>
    {/each}
  </div>

  <div
    bind:this={viewport}
    onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
    class="no-scrollbar flex flex-col overflow-y-auto overscroll-contain"
    style="height:{VISIBLE_ROWS * ROW_PX + (VISIBLE_ROWS - 1) * GAP_PX}px;gap:{GAP_PX}px;scroll-snap-type:y proximity"
  >
    {#each weeks as row (row.getTime())}
      {@const span = visibleSpan(row)}
      <div
        class="relative grid shrink-0 grid-cols-7"
        style="height:{ROW_PX}px;scroll-snap-align:start"
      >
        {#if span}
          <div
            class="absolute inset-y-0 rounded-md bg-surface-alt"
            style="left:calc({span.start} * 100% / 7);width:calc({(span.end - span.start + 1) * 100}% / 7)"
          ></div>
        {/if}
        {#each daysOf(row) as day (day.getTime())}
          {@const inMonth = day.getMonth() === displayedMonth.getMonth()}
          {@const isToday = dayKey(day) === today}
          <button
            type="button"
            onclick={() => data.goToDate(day)}
            class="t-micro press-sm relative flex items-center justify-center rounded-md tabular-nums {isToday
              ? 'bg-danger text-white'
              : inMonth
                ? 'text-fg hoverable'
                : 'text-fg-faint hoverable'}"
          >
            {day.getDate()}
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>
