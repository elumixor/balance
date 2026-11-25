<script lang="ts">
  import { laneFor, laneTitle } from "$lib/activity/lane";
  import { weekKey } from "$lib/calendar/dates";
  import type { Category } from "$lib/core/records";
  import { activityOf } from "$lib/core/store.svelte";

  /**
   * What the day actually was, as a thread down the column's left edge: one sphere's colour per
   * stretch, settled by the server between what was observed and what the calendar held. It says
   * nothing until it is pointed at, and a day nothing is known about has no thread at all.
   */
  let { day, hourPx, categories }: { day: Date; hourPx: number; categories: Map<string, Category> } = $props();

  const marks = $derived(laneFor(activityOf(weekKey(day))?.segments ?? [], day));
</script>

{#each marks as mark (mark.key)}
  {@const sphere = categories.get(mark.sphereId)}
  {#if sphere}
    <div
      class="absolute left-0 z-40 w-[3px] rounded-full opacity-70 hover:opacity-100"
      style="top:{(mark.startMinutes / 60) * hourPx}px;height:{((mark.endMinutes - mark.startMinutes) / 60) *
        hourPx}px;background:{sphere.color}"
      title={laneTitle(mark, sphere.name)}
    ></div>
  {/if}
{/each}
