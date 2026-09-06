<script lang="ts">
  import { Dot } from "$lib/components";
  import { restColor } from "$lib/ui/colors";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import type { Category } from "$lib/core/records";
  import { CalendarPlus, GripVertical } from "lucide-svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import FillWeekSheet from "./FillWeekSheet.svelte";

  /**
   * The projects that want hours this week, as chips to drag onto the grid. A chip becomes a
   * block that counts toward the project's sphere and is evidence for its gate; a task under the
   * chip narrows the block to that task, and brings its estimate as the block's length.
   */
  let { categories }: { categories: readonly Category[] } = $props();

  const data = calendarData;
  const colorOf = $derived(new Map(categories.map((c) => [c.id, c.color])));
  const live = $derived(
    projectsData.cards.filter((card) => !card.archived && (card.project.hoursPerWeek > 0 || card.stage)),
  );

  let planning = $state(false);

  function begin(projectId: string, taskId: string | null, e: PointerEvent) {
    const source = data.sourceForProject(projectId, taskId);
    if (source) data.beginCreate(source, e);
  }
</script>

{#if live.length > 0}
  <button
    type="button"
    onclick={() => (planning = true)}
    class="press hoverable mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-2 py-1.5 text-fg-muted"
  >
    <CalendarPlus size={13} />
    <span class="t-micro">Plan the week</span>
  </button>
  <FillWeekSheet open={planning} onclose={() => (planning = false)} {categories} />
  <ul class="space-y-1.5">
    {#each live as card (card.project.id)}
      {@const color = colorOf.get(card.project.categoryId) ?? restColor}
      {@const tasks = card.stage ? (projectsData.tasksByStage.get(card.stage.id) ?? []).filter((t) => !t.done) : []}
      <li class="space-y-1">
        <div
          role="button"
          tabindex="0"
          onpointerdown={(e) => begin(card.project.id, null, e)}
          onpointermove={(e) => data.moveDrag(e)}
          onpointerup={(e) => data.endDrag(e)}
          onpointercancel={() => data.endDrag()}
          class="press-sm flex cursor-grab items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 select-none touch-none"
        >
          <Dot {color} size={6} />
          <span class="t-micro min-w-0 flex-1 truncate text-fg">{card.project.name || "Untitled project"}</span>
          {#if card.project.hoursPerWeek > 0}
            <span class="t-micro shrink-0 text-fg-faint">{formatHoursDecimal(card.project.hoursPerWeek)}/wk</span>
          {/if}
          <GripVertical size={12} class="shrink-0 text-fg-faint" />
        </div>
        {#each tasks as task (task.id)}
          <div
            role="button"
            tabindex="0"
            onpointerdown={(e) => begin(card.project.id, task.id, e)}
            onpointermove={(e) => data.moveDrag(e)}
            onpointerup={(e) => data.endDrag(e)}
            onpointercancel={() => data.endDrag()}
            class="press-sm ml-4 flex cursor-grab items-center gap-2 rounded-md px-2 py-1 select-none touch-none hover:bg-surface-alt"
          >
            <span class="t-micro min-w-0 flex-1 truncate text-fg-muted">{task.title}</span>
            {#if task.estimateHours}
              <span class="t-micro shrink-0 text-fg-faint">{formatHoursDecimal(task.estimateHours)}</span>
            {/if}
          </div>
        {/each}
      </li>
    {/each}
  </ul>
{/if}
