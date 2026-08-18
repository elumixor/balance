<script lang="ts">
  import SplitBar from "$lib/components/SplitBar.svelte";
  import { activitySplits } from "$lib/splits";
  import type { Activity, Category } from "$lib/types";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * Activities are templates: drag one onto the grid and it becomes a real event in the calendar,
   * already counting toward the categories that activity is made of.
   *
   * A column in the rail, a scrolling row on a phone — the same chips either way.
   */
  let {
    activities,
    categories,
    layout = "column",
  }: {
    activities: readonly Activity[];
    categories: Map<string, Category>;
    layout?: "column" | "row";
  } = $props();

  const data = calendarData;
  const live = $derived(activities);
</script>

<div
  class="-mx-1 flex gap-2 px-1 {layout === 'column' ? 'flex-col' : 'overflow-x-auto pb-1'}"
  role="list"
  aria-label="Activities"
>
  {#each live as activity (activity.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      role="listitem"
      class="press-sm shrink-0 cursor-grab touch-none rounded-md border border-line bg-surface px-3 py-2 {layout ===
      'column'
        ? 'w-full'
        : ''}"
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
