<script lang="ts">
  import { addDays, startOfWeek } from "$lib/dates";
  import { theme } from "$lib/theme.svelte";
  import { ChevronDown, ChevronUp, Undo2 } from "lucide-svelte";
  import { fly } from "svelte/transition";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * The month as a picker: six weeks, the currently visible seven days washed with a plate, today
   * in red. Tapping any day jumps the grid to the week it falls in, same as the strip's own
   * scrolling would — as does a vertical scroll here, one week at a time, and the month arrows.
   *
   * The displayed month is its own state rather than read off the focused week — a swipe-scrolled,
   * non-Monday window can straddle two months, and a month arrow always has to land on a whole one
   * regardless of which day of it the grid happened to be showing before.
   */
  const data = calendarData;

  const VISIBLE_DAYS = 7;
  const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  /** A wheel notch in line units is worth about a line of text — same scale the grid's own wheel
   *  handling uses. Divided into steps so a slow scroll still snaps a whole week at a time. */
  const LINE_PX = 16;
  const STEP_PX = 42;

  const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = dayKey(new Date());

  let displayedMonth = $state(monthStart(data.weekStart));
  /** Which way the plate last moved, so the slide between months leaves in that direction. */
  let direction = $state(1);
  /** Bumped by every jump this component itself starts, so the slide plays for those and only
   *  those — a swipe on the main grid moves the same state without asking for one. */
  let jumpToken = $state(0);

  const monthLabel = $derived(displayedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
  const gridStart = $derived(startOfWeek(displayedMonth));
  const rows = $derived(
    Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day))),
  );
  const onCurrentMonth = $derived(displayedMonth.getTime() === monthStart(new Date()).getTime());

  // The strip always shows exactly seven consecutive days, but a swipe can land that window on
  // any weekday — not just a Monday — so it can cut across two of the grid's own Monday-start rows.
  const visibleStart = $derived(data.windowStart);
  const visibleEnd = $derived(addDays(visibleStart, VISIBLE_DAYS - 1));

  function visibleSpan(row: readonly Date[]): { start: number; end: number } | null {
    let start = -1;
    let end = -1;
    for (let i = 0; i < row.length; i++) {
      const time = row[i].getTime();
      if (time < visibleStart.getTime() || time > visibleEnd.getTime()) continue;
      if (start === -1) start = i;
      end = i;
    }
    return start === -1 ? null : { start, end };
  }

  // A swipe on the main grid moves `windowStart` on its own, without going through `jumpTo` — if
  // that drifts the visible days off the currently displayed month entirely, follow it, or the
  // plate above would just vanish instead of showing where the week went. No slide of its own:
  // this is the grid catching up to a scroll already in progress elsewhere, not a jump.
  $effect(() => {
    const start = visibleStart.getTime();
    const end = visibleEnd.getTime();
    const first = gridStart.getTime();
    const last = addDays(gridStart, 41).getTime();
    if (start >= first && end <= last) return;
    displayedMonth = monthStart(visibleStart);
  });

  /** Every jump this grid starts goes through here: which way it moved, and the month it lands on. */
  function jumpTo(date: Date, dir: number) {
    direction = dir;
    displayedMonth = monthStart(date);
    jumpToken++;
    data.goToDate(date);
  }

  function selectDay(day: Date) {
    jumpTo(day, day.getTime() >= visibleStart.getTime() ? 1 : -1);
  }

  function shiftMonth(delta: number) {
    jumpTo(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + delta, 1), delta);
  }

  function backToToday() {
    const now = new Date();
    jumpTo(now, monthStart(now).getTime() >= displayedMonth.getTime() ? 1 : -1);
  }

  /** A vertical scroll here pages through weeks — and the months they fall into — one at a time,
   *  the same discrete step a wheel notch is anywhere else in the app. */
  function verticalScroll(node: HTMLElement) {
    let accumulated = 0;

    function onwheel(event: WheelEvent) {
      if (event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_PX : 1;
      accumulated += event.deltaY * scale;
      while (Math.abs(accumulated) >= STEP_PX) {
        const dir = accumulated > 0 ? 1 : -1;
        accumulated -= dir * STEP_PX;
        jumpTo(addDays(data.anchor, dir * 7), dir);
      }
    }

    node.addEventListener("wheel", onwheel, { passive: false });
    return { destroy: () => node.removeEventListener("wheel", onwheel) };
  }

  const flyDuration = $derived(theme.reduceMotion ? 0 : 200);
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between px-0.5">
    <span class="t-micro text-fg-muted">{monthLabel}</span>
    <div class="flex items-center gap-0.5">
      {#if !onCurrentMonth}
        <button
          type="button"
          aria-label="Back to the current month"
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

  <div class="overflow-hidden" use:verticalScroll>
    {#key jumpToken}
      <div
        class="flex flex-col gap-0.5"
        in:fly={{ y: direction * 14, duration: flyDuration }}
        out:fly={{ y: -direction * 14, duration: flyDuration }}
      >
        {#each rows as row (row[0].getTime())}
          {@const span = visibleSpan(row)}
          <div class="relative grid grid-cols-7">
            {#if span}
              <div
                class="absolute inset-y-0 rounded-md bg-surface-alt"
                style="left:calc({span.start} * 100% / 7);width:calc({(span.end - span.start + 1) * 100}% / 7)"
              ></div>
            {/if}
            {#each row as day (day.getTime())}
              {@const inMonth = day.getMonth() === displayedMonth.getMonth()}
              {@const isToday = dayKey(day) === today}
              <button
                type="button"
                onclick={() => selectDay(day)}
                class="t-label press-sm relative flex items-center justify-center rounded-md py-1 {isToday
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
    {/key}
  </div>
</div>
