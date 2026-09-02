<script lang="ts">
  import Dot from "$lib/components/Dot.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { restColor } from "$lib/colors";
  import { formatHoursDecimal } from "$lib/format";
  import { projects } from "$lib/synced.svelte";
  import type { CalendarEvent, Category } from "$lib/types";
  import { projectHours } from "./project-hours";

  /**
   * Under the dial: each live project's hours this week against its claim, in its sphere's
   * colour. The dial says how the spheres are filling; this says which projects inside them are
   * getting their hours — the layer between "24h for Projects" and "Tuesday 9:00".
   */
  let {
    events,
    categories,
    weekStart,
  }: { events: readonly CalendarEvent[]; categories: readonly Category[]; weekStart: Date } = $props();

  const colorOf = $derived(new Map(categories.map((c) => [c.id, c.color])));
  const totals = $derived(projectHours(events, projects.all, weekStart));
</script>

{#if totals.length > 0}
  <ul class="space-y-2">
    {#each totals as total (total.id)}
      {@const color = colorOf.get(total.categoryId) ?? restColor}
      <li class="space-y-1">
        <a href="/projects/{total.id}" class="flex items-center gap-2">
          <Dot {color} size={6} />
          <span class="t-micro min-w-0 flex-1 truncate text-fg">{total.name || "Untitled project"}</span>
          <span class="t-micro shrink-0 tabular-nums text-fg-faint">
            {formatHoursDecimal(total.actualHours)}{total.claimedHours > 0 ? ` / ${formatHoursDecimal(total.claimedHours)}` : ""}
          </span>
        </a>
        {#if total.claimedHours > 0}
          <ProgressBar ratio={total.actualHours / total.claimedHours} {color} height={3} />
        {/if}
      </li>
    {/each}
  </ul>
{/if}
