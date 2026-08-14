<script lang="ts">
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { formatHoursDecimal } from "$lib/format";
  import type { CalendarEvent, Category } from "$lib/types";
  import { weekTotals } from "./week-totals";

  /**
   * What the week is actually shaping up to be, against what it was planned to be — a column of
   * meters in the rail. Computed from the blocks on screen rather than fetched, so remapping an
   * event moves the bar at once.
   */
  let {
    events,
    categories,
    weekStart,
  }: { events: readonly CalendarEvent[]; categories: readonly Category[]; weekStart: Date } = $props();

  const planned = $derived(weekTotals(events, categories, weekStart).filter((c) => c.plannedHours > 0));
</script>

<div class="flex flex-col gap-2">
  {#each planned as category (category.id)}
    <div class="space-y-1">
      <div class="flex items-center gap-1.5">
        <CategoryIcon icon={category.icon} color={category.color} size={16} />
        <span class="t-micro min-w-0 flex-1 truncate">{category.name}</span>
        <span class="shrink-0 font-sans text-[10px] leading-none text-fg-muted/60">
          {formatHoursDecimal(category.actualHours).slice(0, -1)} / {formatHoursDecimal(category.plannedHours)}&nbsp;&nbsp;&nbsp;{Math.round(
            (category.actualHours / category.plannedHours) * 100,
          )}%
        </span>
      </div>
      <ProgressBar ratio={category.actualHours / category.plannedHours} color={category.color} height={3} />
    </div>
  {/each}
</div>
