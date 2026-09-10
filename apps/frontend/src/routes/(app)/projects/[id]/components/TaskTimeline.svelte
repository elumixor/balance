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
   * everything dated and today, so a project nobody has put a date on still draws a grid — and
   * the line for today is the only strong mark on it.
   */
  let {
    projectId,
    color = restColor,
    selectedId,
    onselect,
  }: { projectId: string; color?: string; selectedId: string | null; onselect: (id: string | null) => void } = $props();

  const stages = $derived(data.stagesOf(projectId));
  const tasks = $derived(data.tasksOf(projectId));
  const bounds = $derived(
    boundsOf(
      tasks.map((task) => spanOf(task.id, tasks)),
      data.today,
    ),
  );
  const columns = $derived(columnsOf(bounds));
  const today = $derived(barOf({ start: data.today, end: data.today }, bounds));
  const loose = $derived(data.taskRowsOf(projectId, null));

  /** A stage's own dates if it has them, and otherwise the run of the tasks that name it. */
  function stageSpan(stage: Stage) {
    if (stage.startsOn) return { start: stage.startsOn, end: stage.endsOn ?? stage.startsOn };
    const own = tasks.filter((task) => task.stageId === stage.id).map((task) => spanOf(task.id, tasks));
    const known = own.filter((span) => span !== null);
    if (known.length === 0) return null;
    return {
      start: known.reduce((first, span) => (span.start < first ? span.start : first), known[0].start),
      end: known.reduce((last, span) => (span.end > last ? span.end : last), known[0].end),
    };
  }

  function add(stage: Stage | null) {
    const created = data.addTask(projectId, stage?.id ?? null);
    onselect(created.id);
  }
</script>

<div class="rounded-lg border border-line bg-surface">
  <div class="relative">
    <!-- The grid: one hairline a week, and today's own line over it. -->
    <div class="pointer-events-none absolute inset-0">
      {#each columns as column, index (column.key)}
        {#if index > 0}
          <div class="absolute inset-y-0 border-l border-line" style="left:{column.leftPercent}%"></div>
        {/if}
      {/each}
      <div class="absolute inset-y-0 w-px bg-ink/25" style="left:{today.leftPercent}%"></div>
    </div>

    <div class="relative h-6 border-b border-line">
      {#each columns as column (column.key)}
        <span
          class="t-data-micro absolute top-1 truncate pl-1.5 text-fg-faint"
          style="left:{column.leftPercent}%;width:{column.widthPercent}%"
        >
          {column.label}
        </span>
      {/each}
    </div>

    <div class="relative space-y-1 px-1.5 py-2">
      {#each stages as stage (stage.id)}
        {@const span = stageSpan(stage)}
        {@const completion = data.completionOf(projectId, stage.id)}
        {@const bar = span ? barOf(span, bounds) : null}
        <div class="relative h-6">
          <div
            class="absolute inset-y-0.5 flex items-center justify-between gap-2 rounded-sm border border-line-strong bg-surface-alt px-2"
            style={bar ? `left:${bar.leftPercent}%;width:${bar.widthPercent}%` : "left:0;width:100%"}
          >
            <span class="t-micro truncate text-fg-muted">{stage.name || "Stage"}</span>
            {#if completion.total > 0}
              <span class="t-data-micro shrink-0 text-fg-faint">
                {Math.round(completion.share * 100)}%
              </span>
            {/if}
          </div>
        </div>

        {#each data.taskRowsOf(projectId, stage.id) as row (row.item.id)}
          <TaskBar
            task={row.item}
            depth={row.depth}
            {bounds}
            {tasks}
            {color}
            selected={row.item.id === selectedId}
            onselect={() => onselect(row.item.id === selectedId ? null : row.item.id)}
          />
        {/each}

        <button type="button" onclick={() => add(stage)} class="bare-button t-micro px-1.5 py-0.5">
          <Plus size={11} />
          Task in {stage.name || "stage"}
        </button>
      {/each}

      {#each loose as row (row.item.id)}
        <TaskBar
          task={row.item}
          depth={row.depth}
          {bounds}
          {tasks}
          {color}
          selected={row.item.id === selectedId}
          onselect={() => onselect(row.item.id === selectedId ? null : row.item.id)}
        />
      {/each}

      <button type="button" onclick={() => add(null)} class="bare-button t-micro px-1.5 py-0.5">
        <Plus size={11} />
        Task
      </button>
    </div>
  </div>
</div>
