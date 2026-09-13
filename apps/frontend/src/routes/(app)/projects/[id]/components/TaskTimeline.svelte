<script lang="ts">
  import { Field, Select } from "$lib/components";
  import {
    addDays,
    dayAt,
    offsetOf,
    SCALES,
    unionOf,
    type ScaleKey,
    type Span,
    spanOf,
    ticksOf,
    widthOf,
    windowOf,
  } from "$lib/projects/gantt";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { NAME_WIDTH, ROW_HEIGHT, TimelineDrag, TimelineScale } from "$lib/projects/timeline.svelte";
  import type { Person, Stage, Task } from "$lib/projects/types";
  import { restColor } from "$lib/ui/colors";
  import { ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2 } from "lucide-svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { tick } from "svelte";
  import TimelineBar from "./TimelineBar.svelte";
  import TimelineHeader from "./TimelineHeader.svelte";

  /**
   * The plan as it sits in time. A band per stage across the grid, every task as a bar under it on
   * the same scale, and the names beside them in a column that stays put while the days scroll.
   *
   * Everything is edited where it is read: a bar is carried to move the work and pulled by an edge
   * to lengthen it, a name is typed in place, and a task with no dates yet takes them from
   * wherever on its own row it is pressed.
   */
  let {
    projectId,
    color = restColor,
    selectedId,
    onselect,
  }: { projectId: string; color?: string; selectedId: string | null; onselect: (id: string | null) => void } = $props();

  /** What a task is given when its dates are set by pressing its empty row. */
  const NEW_TASK_DAYS = 5;
  /** How much of a screenful the arrows move. */
  const NUDGE = 0.75;

  const scale = new TimelineScale();
  const drag = new TimelineDrag();
  const collapsed = new SvelteSet<string>();

  let scroller = $state<HTMLDivElement | null>(null);
  let hover = $state<{ id: string; day: string } | null>(null);
  let landed = false;

  const stages = $derived(data.stagesOf(projectId));
  const tasks = $derived(data.tasksOf(projectId));
  const spans = $derived(tasks.map((task) => spanOf(task.id, tasks)));
  const bounds = $derived(windowOf(spans, data.today, scale.value));
  const width = $derived(widthOf(bounds, scale.value));
  const columns = $derived(ticksOf(bounds, scale.value, data.today));
  const todayLeft = $derived(offsetOf(data.today, bounds, scale.value));
  const loose = $derived(data.taskRowsOf(projectId, null, collapsed));

  // Opening the screen lands on now: a plan two years long opened at its start says nothing.
  $effect(() => {
    if (landed || !scroller) return;
    landed = true;
    center(data.today, "instant");
  });

  function center(day: string, behavior: ScrollBehavior = "smooth") {
    if (!scroller) return;
    const visible = scroller.clientWidth - NAME_WIDTH;
    scroller.scrollTo({ left: offsetOf(day, bounds, scale.value) - visible / 2, behavior });
  }

  function nudge(direction: 1 | -1) {
    scroller?.scrollBy({ left: direction * (scroller.clientWidth - NAME_WIDTH) * NUDGE, behavior: "smooth" });
  }

  /** Zooming keeps whatever was in the middle of the screen in the middle of it. */
  async function zoom(key: ScaleKey) {
    const middle = scroller ? dayAt(scroller.scrollLeft + (scroller.clientWidth - NAME_WIDTH) / 2, bounds, scale.value) : data.today;
    scale.set(key);
    await tick();
    center(middle, "instant");
  }

  const peopleOn = (task: Task) =>
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one));

  const hasChildren = (id: string) => tasks.some((task) => task.parentId === id);

  /** A stage's own dates if it has them, and otherwise the run of the tasks that name it. */
  function stageSpan(stage: Stage): Span | null {
    if (stage.startsOn) return { start: stage.startsOn, end: stage.endsOn ?? stage.startsOn };
    return unionOf(tasks.filter((task) => task.stageId === stage.id).map((task) => spanOf(task.id, tasks)));
  }

  function dayFrom(event: PointerEvent | MouseEvent, element: HTMLElement) {
    return dayAt(event.clientX - element.getBoundingClientRect().left, bounds, scale.value);
  }

  function schedule(task: Task, day: string) {
    data.updateTask(task.id, { startsOn: day, endsOn: addDays(day, NEW_TASK_DAYS - 1) });
    onselect(task.id);
  }

  function add(stageId: string | null, parentId: string | null = null) {
    onselect(data.addTask(projectId, stageId, parentId).id);
  }

  function fold(id: string) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
  }
</script>

{#snippet nothing()}{/snippet}

{#snippet nameCell(children: import("svelte").Snippet, depth = 0)}
  <div
    class="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-line bg-surface pr-2"
    style="width:{NAME_WIDTH}px;padding-left:{6 + depth * 14}px"
  >
    {@render children()}
  </div>
{/snippet}

{#snippet taskRow(task: Task, depth: number)}
  {@const span = spanOf(task.id, tasks)}
  {@const own = Boolean(task.startsOn)}
  {@const finished = task.status === "done" || task.status === "dropped"}
  <div class="group flex" style="height:{ROW_HEIGHT}px">
    {#snippet name()}
      {#if hasChildren(task.id)}
        <button
          type="button"
          onclick={() => fold(task.id)}
          aria-label={collapsed.has(task.id) ? "Show subtasks" : "Hide subtasks"}
          class="bare-button size-5"
        >
          {#if collapsed.has(task.id)}<ChevronRight size={12} />{:else}<ChevronDown size={12} />{/if}
        </button>
      {:else}
        <span class="size-5 shrink-0"></span>
      {/if}
      <Field
        value={task.title}
        variant="bare"
        placeholder="Untitled task"
        ariaLabel="Task title"
        oninput={(title) => data.updateTask(task.id, { title })}
        class="field-sm {finished ? 'text-fg-faint line-through' : ''}"
      />
      <button
        type="button"
        onclick={() => add(task.stageId, task.id)}
        aria-label="Add subtask"
        class="bare-button size-5 opacity-0 group-hover:opacity-100"
      >
        <Plus size={12} />
      </button>
    {/snippet}
    {@render nameCell(name, depth)}

    <div
      class="relative"
      style="width:{width}px"
      role="presentation"
      onpointermove={(event) => {
        if (!span) hover = { id: task.id, day: dayFrom(event, event.currentTarget) };
      }}
      onpointerleave={() => (hover = null)}
    >
      {#if span}
        <TimelineBar
          id={task.id}
          {span}
          window={bounds}
          scale={scale.value}
          {drag}
          {color}
          tone={Math.max(0.3, 0.9 - depth * 0.2)}
          label={task.title || "Untitled task"}
          people={peopleOn(task)}
          faded={finished}
          selected={task.id === selectedId}
          movable={own}
          onselect={() => onselect(task.id === selectedId ? null : task.id)}
          oncommit={(next) => data.updateTask(task.id, { startsOn: next.start, endsOn: next.end })}
          onjump={(day) => center(day)}
        />
      {:else}
        <button
          type="button"
          onclick={(event) => schedule(task, dayFrom(event, event.currentTarget))}
          class="absolute inset-0 w-full cursor-copy"
          aria-label="Give {task.title || 'this task'} dates"
        ></button>
        {#if hover?.id === task.id}
          <span
            class="t-micro pointer-events-none absolute inset-y-1 flex items-center rounded-sm border border-dashed border-line-strong px-1.5 text-fg-faint"
            style="left:{offsetOf(hover.day, bounds, scale.value)}px;width:{NEW_TASK_DAYS * scale.value.dayWidth}px"
          >
            Set dates
          </span>
        {/if}
      {/if}
    </div>
  </div>
{/snippet}

<div class="flex h-full min-h-0 flex-col bg-surface">
  <div class="flex shrink-0 items-center justify-end gap-1 border-b border-line px-2 py-1.5">
    <Select
      variant="bare"
      label="Zoom"
      width={140}
      value={scale.key}
      options={SCALES.map((one) => ({ value: one.key, label: one.label }))}
      onchange={(key) => void zoom(key)}
    />
    <button type="button" onclick={() => nudge(-1)} aria-label="Earlier" class="bare-button size-7">
      <ChevronLeft size={14} />
    </button>
    <button type="button" onclick={() => center(data.today)} class="bare-button t-micro px-2 py-1">Today</button>
    <button type="button" onclick={() => nudge(1)} aria-label="Later" class="bare-button size-7">
      <ChevronRight size={14} />
    </button>
  </div>

  <div bind:this={scroller} class="relative min-h-0 flex-1 overflow-auto overscroll-x-contain">
    <!-- The grid is as tall as the window whether or not there are rows to fill it: a plan with
         two tasks in it is still a plan, and days that stop halfway down the screen read as a
         page that failed to load. -->
    <div class="flex min-h-full w-max min-w-full flex-col">
      <TimelineHeader window={bounds} scale={scale.value} today={data.today} {width} />

      <div class="relative min-h-0 flex-1">
        <!-- The grid behind everything: a line a column, weekends shaded, and today's own mark. -->
        <div class="pointer-events-none absolute inset-y-0 z-0" style="left:{NAME_WIDTH}px;width:{width}px">
          {#each columns as column (column.key)}
            <div
              class="absolute inset-y-0 border-l border-line/70 {column.weekend ? 'bg-surface-alt/60' : ''}"
              style="left:{column.left}px;width:{column.width}px"
            ></div>
          {/each}
          <div class="absolute inset-y-0 w-px bg-ink/50" style="left:{todayLeft}px"></div>
        </div>

        <div class="relative z-10 flex h-full flex-col py-1">
          {#each stages as stage (stage.id)}
            {@const span = stageSpan(stage)}
            {@const completion = data.completionOf(projectId, stage.id)}
            <div class="group flex" style="height:{ROW_HEIGHT}px">
              {#snippet stageName()}
                <Field
                  value={stage.name}
                  variant="bare"
                  placeholder="Stage"
                  ariaLabel="Stage name"
                  oninput={(name) => data.updateStage(stage.id, { name })}
                  class="field-sm t-label"
                />
                <button
                  type="button"
                  onclick={() => data.removeStage(stage)}
                  aria-label="Remove stage"
                  class="bare-button size-5 opacity-0 group-hover:opacity-100 hover:text-danger"
                >
                  <Trash2 size={11} />
                </button>
              {/snippet}
              {@render nameCell(stageName)}

              <div class="relative" style="width:{width}px">
                {#if span}
                  <TimelineBar
                    id={stage.id}
                    {span}
                    window={bounds}
                    scale={scale.value}
                    {drag}
                    {color}
                    band
                    label={stage.name || "Stage"}
                    movable={Boolean(stage.startsOn)}
                    oncommit={(next) => data.updateStage(stage.id, { startsOn: next.start, endsOn: next.end })}
                    onjump={(day) => center(day)}
                  >
                    {#snippet trailing()}
                      {#if completion.total > 0}
                        <span class="t-data-micro shrink-0 text-fg-faint">
                          {Math.round(completion.share * 100)}%
                        </span>
                      {/if}
                    {/snippet}
                  </TimelineBar>
                {/if}
              </div>
            </div>

            {#each data.taskRowsOf(projectId, stage.id, collapsed) as row (row.item.id)}
              {@render taskRow(row.item, row.depth)}
            {/each}

            <div class="flex" style="height:{ROW_HEIGHT}px">
              {#snippet addInStage()}
                <button type="button" onclick={() => add(stage.id)} class="bare-button t-micro px-1.5 py-0.5">
                  <Plus size={11} />
                  Task
                </button>
              {/snippet}
              {@render nameCell(addInStage)}
              <div style="width:{width}px"></div>
            </div>
          {/each}

          {#each loose as row (row.item.id)}
            {@render taskRow(row.item, row.depth)}
          {/each}

          <div class="flex" style="height:{ROW_HEIGHT}px">
            {#snippet addLoose()}
              <button type="button" onclick={() => add(null)} class="bare-button t-micro px-1.5 py-0.5">
                <Plus size={11} />
                Task
              </button>
            {/snippet}
            {@render nameCell(addLoose)}
            <div style="width:{width}px"></div>
          </div>

          <!-- What is left of the window under the last row: the names keep their edge and the days
               keep their lines all the way down. -->
          <div class="flex min-h-0 flex-1">
            {@render nameCell(nothing)}
            <div style="width:{width}px"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
