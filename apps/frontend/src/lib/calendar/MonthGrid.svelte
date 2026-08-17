<script lang="ts">
  import { addDays, startOfWeek } from "$lib/dates";
  import { ChevronDown, ChevronUp } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * The month as a picker: six weeks, the currently visible seven days washed with a plate, today
   * in red. Tapping any day jumps the grid to the week it falls in, same as the strip's own
   * scrolling would.
   *
   * The displayed month is its own state rather than read off the focused week — a swipe-scrolled,
   * non-Monday window can straddle two months, and a month arrow always has to land on a whole one
   * regardless of which day of it the grid happened to be showing before.
   */
  const data = calendarData;

  const VISIBLE_DAYS = 7;
  const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = dayKey(new Date());

  let displayedMonth = $state(monthStart(data.weekStart));

  const monthLabel = $derived(displayedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
  const gridStart = $derived(startOfWeek(displayedMonth));
  const rows = $derived(
    Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day))),
  );

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

  // A swipe on the main grid moves `windowStart` on its own, without going through `selectDay` or
  // a month arrow — if that drifts the visible days off the currently displayed month entirely,
  // follow it, or the plate above would just vanish instead of showing where the week went.
  $effect(() => {
    const start = visibleStart.getTime();
    const end = visibleEnd.getTime();
    const first = gridStart.getTime();
    const last = addDays(gridStart, 41).getTime();
    if (start >= first && end <= last) return;
    displayedMonth = monthStart(visibleStart);
  });

  function selectDay(day: Date) {
    displayedMonth = monthStart(day);
    data.goToDate(day);
  }

  function shiftMonth(delta: number) {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + delta, 1);
    data.goToDate(displayedMonth);
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between px-0.5">
    <span class="t-micro text-fg-muted">{monthLabel}</span>
    <div class="flex items-center gap-0.5">
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

  <div class="flex flex-col gap-0.5">
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
</div>
