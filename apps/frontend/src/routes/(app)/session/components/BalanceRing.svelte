<script lang="ts">
  import { CategoryIcon } from "$lib/components";
  import { WeekRing } from "$lib/components/ring";
  import type { CategoryHours } from "$lib/planning/types";

  /**
   * The day as a dial: the ring the whole app is built around, sized to sit in a column, with the
   * spheres it is made of listed beside it. Read-only here — the ring that can be dragged is on
   * the spheres screen, and this one is a record.
   */
  let { categories, hours }: { categories: readonly CategoryHours[]; hours: number } = $props();

  const segments = $derived(
    categories.map((category) => ({
      id: category.categoryId,
      label: category.name,
      color: category.color,
      icon: category.icon,
      value: category.hours,
    })),
  );

  function format(value: number) {
    return `${Math.round(value * 10) / 10}h`;
  }
</script>

<div class="flex items-center gap-5">
  <div class="pointer-events-none shrink-0">
    <WeekRing {segments} size={124} thickness={16} centerValue={format(hours)} centerLabel="today" onchange={() => {}} />
  </div>
  <ul class="min-w-0 flex-1 space-y-1.5">
    {#each categories.slice(0, 5) as category (category.categoryId)}
      <li class="flex items-center gap-2">
        <CategoryIcon icon={category.icon} color={category.color} size={14} />
        <span class="t-label min-w-0 flex-1 truncate">{category.name}</span>
        <span class="t-data text-fg-muted">{format(category.hours)}</span>
      </li>
    {/each}
  </ul>
</div>
