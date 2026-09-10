<script lang="ts">
  import { barOf, boundsOf, columnsOf, spanOf } from "$lib/projects/gantt";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Stage, Task } from "$lib/projects/types";
  import { restColor } from "$lib/ui/colors";
  import { Plus } from "lucide-svelte";
  import TaskBar from "./TaskBar.svelte";

  /**
   * The plan as it sits in time: a band per stage across the top, and under it every task as a
   * bar on the same scale, subtasks indented inside their parent's run. The window covers
   * everything dated and today, so a project nobody has put a date on still draws a grid.
   */
  let { projectId, color = restColor }: { projectId: string; color?: string } = $props();

  const stages = $derived(data.stagesOf(projectId));
  const tasks = $derived(data.tasksOf(projectId));
  const bounds = $derived(boundsOf(tasks.map((task) => spanOf(task.id, tasks)), data.today));
  const columns = $derived(columnsOf(bounds));
  const todayBar = $derived(barOf({ start: data.today, end: data.today }, bounds));

  /** A stage's own dates if it has them, and otherwise the run of the tasks that name it. */
  function stageSpan(stage: Stage) {
    if (stage.startsOn) return { start: stage.startsOn, end: stage.endsOn ?? stage.startsOn };
    const own = tasks.filter((task) => task.stageId === stage.id);
    return own.length === 0 ? null : boundsOfTasks(own);
  }

  function boundsOfTasks(own: readonly Task[]) {
    const spans = own.map((task) => spanOf(task.id, tasks)).filter((span) => span !== null);
    if (spans.length === 0) return null;
    return {
      start: spans.reduce((first, span) => (span.start < first ? span.start : first), spans[0]?.start ?? ""),
      end: spans.reduce((last, span) => (span.end > last ? span.end : last), spans[0]?.end ?? ""),
    };
  }
</script>

<div class="relative overflow-hidden rounded-lg border border-line bg-surface">
  <!-- The grid: one hairline per week, and today's own line over it. -->
  <div class="pointer-events-none absolute inset-0">
    {#each columns as column (column.key)}
      <div class="absolute inset-y-0 border-l border-line" style="left:{column.leftPercent}%"></div>
    {/each}
    <div class="absolute inset-y-0 w-px bg-ink/30" style="left:{todayBar.leftPercent}%"></div>
  </div>

  <div class="relative flex h-5 items-center">
    {#each columns as column (column.key)}
      <span
        class="t-micro absolute truncate pl-1.5 text-fg-faint"
        style="left:{column.leftPercent}%;width:{column.widthPercent}%"
      >
        {column.label}
      </span>
    {/each}
  </div>

  <div class="relative space-y-1 p-2">
    {#each stages as stage (stage.id)}
      {@const span = stageSpan(stage)}
      {@const completion = data.completionOf(projectId, stage.id)}
      <div class="relative h-6">
        {#if span}
          {@const bar = barOf(span, bounds)}
          <div
            class="absolute inset-y-0 flex items-center justify-between gap-2 rounded-md border border-line-strong bg-surface-alt px-2"
            style="left:{bar.leftPercent}%;width:{bar.widthPercent}%"
          >
            <span class="t-micro truncate text-fg-muted">{stage.name || "Stage"}</span>
            {#if completion.total > 0}
              <span class="t-micro shrink-0 tabular-nums text-fg-faint">{Math.round(completion.share * 100)}%</span>
            {/if}
          </div>
        {:else}
          <div class="t-micro flex h-full items-center text-fg-faint">{stage.name || "Stage"} — nothing dated yet</div>
        {/if}
      </div>

      {#each data.taskRowsOf(projectId, stage.id) as row (row.item.id)}
        <TaskBar task={row.item} depth={row.depth} {bounds} {tasks} {color} />
      {/each}
    {/each}

    {#each data.taskRowsOf(projectId, null) as row (row.item.id)}
      <TaskBar task={row.item} depth={row.depth} {bounds} {tasks} {color} />
    {/each}

    <button
      type="button"
      onclick={() => data.addTask(projectId, stages.at(-1)?.id ?? null)}
      class="press hoverable t-micro flex items-center gap-1.5 rounded-md py-1 text-fg-faint"
    >
      <Plus size={12} />
      Task
    </button>
  </div>
</div>
