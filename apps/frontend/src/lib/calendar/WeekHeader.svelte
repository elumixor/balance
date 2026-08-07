<script lang="ts">
  import DeviationBar from "$lib/components/DeviationBar.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import type { CalendarEvent, Category } from "$lib/types";
  import { weekTotals } from "./week-totals";

  /**
   * What the week is actually shaping up to be, against what it was planned to be. Computed from
   * the blocks on screen rather than fetched, so remapping an event moves the bar at once.
   */
  let {
    events,
    categories,
    weekStart,
  }: { events: readonly CalendarEvent[]; categories: readonly Category[]; weekStart: Date } = $props();

  const totals = $derived(weekTotals(events, categories, weekStart));
  const planned = $derived(totals.categories.filter((c) => c.plannedHours > 0));
</script>

<div class="space-y-3">
  {#if totals.uncategorisedHours > 0}
    <p class="t-label text-fg-muted">
      {formatHoursAndMinutes(totals.uncategorisedHours)} this week doesn't count as anything yet.
    </p>
  {/if}

  <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
    {#each planned as category (category.id)}
      <div class="space-y-1">
        <div class="flex items-baseline justify-between gap-2">
          <span class="t-label truncate">{category.name}</span>
          <span class="t-data-micro text-fg-muted">
            {formatHoursAndMinutes(category.actualHours)} / {formatHoursAndMinutes(category.plannedHours)}
          </span>
        </div>
        <DeviationBar ratio={category.actualHours / category.plannedHours} color={category.color} height={4} />
      </div>
    {/each}
  </div>
</div>
