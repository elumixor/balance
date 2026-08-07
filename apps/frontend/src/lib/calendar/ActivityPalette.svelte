<script lang="ts">
  import SplitBar from "$lib/components/SplitBar.svelte";
  import { activitySplits } from "$lib/splits";
  import type { Activity, Category } from "$lib/types";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * Activities are templates: drag one onto the grid and it becomes a real event in the calendar,
   * already counting toward the categories that activity is made of.
   */
  let { activities, categories }: { activities: readonly Activity[]; categories: Map<string, Category> } = $props();

  const data = calendarData;
  const live = $derived(activities.filter((a) => !a.archived));
</script>

<div class="w-full space-y-2">
  <p class="t-label text-fg-muted">Drag onto the week</p>

  <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:flex-col xl:overflow-visible">
    {#each live as activity (activity.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="press-sm shrink-0 cursor-grab touch-none rounded-md border border-line bg-surface px-3 py-2 xl:w-full"
        onpointerdown={(e) => data.beginCreate(activity, e)}
        onpointermove={(e) => data.moveDrag(e)}
        onpointerup={() => data.endDrag()}
        onpointercancel={() => data.endDrag()}
      >
        <span class="t-label block whitespace-nowrap">{activity.name}</span>
        <div class="mt-1.5 w-full min-w-24">
          <SplitBar splits={activitySplits(activity, categories)} />
        </div>
      </div>
    {/each}
  </div>
</div>
