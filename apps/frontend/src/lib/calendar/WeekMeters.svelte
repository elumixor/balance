<script lang="ts">
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import type { CalendarEvent, Category } from "$lib/types";
  import { weekTotals } from "./week-totals";

  /**
   * What the week is actually shaping up to be, against what it was planned to be — a row of
   * meters thin enough to sit in the strip above the grid. Computed from the blocks on screen
   * rather than fetched, so remapping an event moves the bar at once.
   */
  let {
    events,
    categories,
    weekStart,
  }: { events: readonly CalendarEvent[]; categories: readonly Category[]; weekStart: Date } = $props();

  const planned = $derived(weekTotals(events, categories, weekStart).filter((c) => c.plannedHours > 0));
</script>

<div class="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
  {#each planned as category (category.id)}
    <div class="w-32 shrink-0 space-y-1">
      <div class="flex items-baseline justify-between gap-1.5">
        <span class="t-micro truncate">{category.name}</span>
        <span class="t-data-micro shrink-0 text-fg-muted">
          {formatHoursAndMinutes(category.actualHours)}/{formatHoursAndMinutes(category.plannedHours)}
        </span>
      </div>
      <ProgressBar ratio={category.actualHours / category.plannedHours} color={category.color} height={3} />
    </div>
  {/each}
</div>
