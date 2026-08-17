<script lang="ts">
  import { addDays, startOfWeek, weekKey } from "$lib/dates";
  import { ChevronDown, ChevronUp } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * The month as a picker: six weeks, the current one washed with a plate, today in red. Tapping
   * any day jumps the grid to the week it falls in, same as the strip's own scrolling would.
   */
  const data = calendarData;

  const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = $derived(dayKey(new Date()));

  const referenceMonth = $derived(new Date(data.weekStart.getFullYear(), data.weekStart.getMonth(), 1));
  const gridStart = $derived(startOfWeek(referenceMonth));
  const rows = $derived(
    Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day))),
  );
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between px-0.5">
    <span class="t-micro text-fg-muted">{data.monthLabel}</span>
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Previous month"
        onclick={() => data.goToMonth(-1)}
        class="hoverable press-sm flex size-5 items-center justify-center rounded text-fg-faint"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        aria-label="Next month"
        onclick={() => data.goToMonth(1)}
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
      {@const current = weekKey(row[0]) === data.key}
      <div class="grid grid-cols-7 rounded-md {current ? 'bg-surface-alt' : ''}">
        {#each row as day (day.getTime())}
          {@const inMonth = day.getMonth() === referenceMonth.getMonth()}
          {@const isToday = dayKey(day) === today}
          <button
            type="button"
            onclick={() => data.goToDate(day)}
            class="t-label press-sm flex items-center justify-center rounded-md py-1 {isToday
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
