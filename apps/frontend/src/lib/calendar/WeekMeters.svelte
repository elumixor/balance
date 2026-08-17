<script lang="ts">
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import CategoryRing from "$lib/components/CategoryRing.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import TooltipAnchor from "$lib/components/TooltipAnchor.svelte";
  import { formatHoursDecimal } from "$lib/format";
  import type { CalendarEvent, Category } from "$lib/types";
  import { weekTotals } from "./week-totals";

  /**
   * What the week is actually shaping up to be, against what it was planned to be — a row of
   * rings in the rail, one per category. Computed from the blocks on screen rather than fetched,
   * so remapping an event fills the ring at once.
   */
  let {
    events,
    categories,
    weekStart,
  }: { events: readonly CalendarEvent[]; categories: readonly Category[]; weekStart: Date } = $props();

  const planned = $derived(weekTotals(events, categories, weekStart).filter((c) => c.plannedHours > 0));
</script>

<div class="flex flex-wrap gap-3">
  {#each planned as category (category.id)}
    {@const ratio = category.actualHours / category.plannedHours}
    <TooltipAnchor instant>
      <CategoryRing icon={category.icon} color={category.color} {ratio} />
      {#snippet bubble()}
        <div class="w-48 space-y-1.5 rounded-md border border-line bg-surface px-2.5 py-2 shadow-float">
          <div class="flex items-center gap-1.5">
            <CategoryIcon icon={category.icon} color={category.color} size={16} />
            <span class="t-micro min-w-0 flex-1 truncate text-fg">{category.name}</span>
            <span class="shrink-0 font-sans text-[10px] leading-none text-fg-muted/60">
              {formatHoursDecimal(category.actualHours).slice(0, -1)} / {formatHoursDecimal(
                category.plannedHours,
              )}&nbsp;&nbsp;{Math.round(ratio * 100)}%
            </span>
          </div>
          <ProgressBar {ratio} color={category.color} height={3} />
        </div>
      {/snippet}
    </TooltipAnchor>
  {/each}
</div>
