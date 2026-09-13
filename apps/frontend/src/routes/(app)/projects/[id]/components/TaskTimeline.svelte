<script lang="ts">
  import { Field, Tooltip } from "$lib/components";
  import {
    addDays,
    dayAt,
    offsetOf,
    SCALES,
    type Span,
    spanOf,
    ticksOf,
    unionOf,
    widthOf,
    windowOf,
  } from "$lib/projects/gantt";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { NAME_WIDTH, ROW_HEIGHT, TimelineDrag, TimelineScale } from "$lib/projects/timeline.svelte";
  import type { Person, Stage, Task } from "$lib/projects/types";
  import { restColor } from "$lib/ui/colors";
  import { CalendarDays, ChevronDown, ChevronRight, Plus, ZoomIn, ZoomOut } from "lucide-svelte";
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import StageBand from "./StageBand.svelte";
  import TimelineBar from "./TimelineBar.svelte";
  import TimelineHeader from "./TimelineHeader.svelte";

  /**
   * The plan as it sits in time: the stages as one band each across the days they cover, every
   * task as a bar under them on the same scale, and the names beside them in a column that stays
   * put while the days scroll.
   *
   * Everything is edited where it is read — a bar is carried to move the work and pulled by an
   * edge to lengthen it, a name is typed in place, and a task with no dates yet takes them from
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

  const scale = new TimelineScale();
  const drag = new TimelineDrag();
  const collapsed = new SvelteSet<string>();

  let scroller = $state<HTMLDivElement | null>(null);
  let hover = $state<{ id: string; day: string } | null>(null);
  let landed = false;

  const stages = $derived(data.stagesOf(projectId));
  const tasks = $derived(data.tasksOf(projectId));
  const rows = $derived(data.taskRowsOf(projectId, collapsed));
  const bands = $derived(
    stages
      .map((stage) => ({ stage, span: stageSpan(stage) }))
      .filter((band): band is { stage: Stage; span: Span } => band.span !== null),
  );
  const bounds = $derived(
    windowOf(
      [...tasks.map((task) => spanOf(task.id, tasks)), ...bands.map((band) => band.span)],
      data.today,
      scale.value,
    ),
  );
  const width = $derived(widthOf(bounds, scale.value));
  const columns = $derived(ticksOf(bounds, scale.value, data.today));
  const todayLeft = $derived(offsetOf(data.today, bounds, scale.value));
  /** The slider runs the way zoom does: to the right is closer in, which is the shorter scale. */
  const zoom = $derived(SCALES.length - 1 - SCALES.findIndex((one) => one.key === scale.key));

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

  /** Zooming keeps whatever was in the middle of the screen in the middle of it. */
  async function setZoom(step: number) {
    const middle = scroller
      ? dayAt(scroller.scrollLeft + (scroller.clientWidth - NAME_WIDTH) / 2, bounds, scale.value)
      : data.today;
    scale.set(SCALES[SCALES.length - 1 - step].key);
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

  function dayFrom(event: MouseEvent | PointerEvent, element: HTMLElement) {
    return dayAt(event.clientX - element.getBoundingClientRect().left, bounds, scale.value);
  }

  function schedule(task: Task, day: string) {
    data.updateTask(task.id, { startsOn: day, endsOn: addDays(day, NEW_TASK_DAYS - 1) });
    onselect(task.id);
  }

  function add(parentId: string | null = null) {
    onselect(data.addTask(projectId, null, parentId).id);
  }

  function fold(id: string) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-surface">
  <div class="flex shrink-0 items-center gap-2 px-3 py-1.5">
    <button type="button" onclick={() => data.addStage(projectId, "")} class="bare-button t-micro px-1.5 py-1">
      <Plus size={11} />
      Stage
    </button>

    <div class="flex-1"></div>

    <div class="flex items-center gap-1.5 text-fg-faint">
      <ZoomOut size={13} />
      <input
        type="range"
        min="0"
        max={SCALES.length - 1}
        step="1"
        value={zoom}
        aria-label="Zoom"
        oninput={(event) => void setZoom(Number(event.currentTarget.value))}
        class="h-1 w-28 cursor-pointer accent-ink"
      />
      <ZoomIn size={13} />
    </div>

    <Tooltip label="Today">
      <button type="button" onclick={() => center(data.today)} aria-label="Go to today" class="bare-button size-7">
        <CalendarDays size={14} />
      </button>
    </Tooltip>
  </div>

  <div bind:this={scroller} class="relative min-h-0 flex-1 overflow-auto overscroll-x-contain">
    <!-- The grid is as tall as the window whether or not there are rows to fill it: a plan with two
         tasks in it is still a plan, and days that stop halfway down read as a page half-drawn. -->
    <div class="flex min-h-full w-max min-w-full flex-col">
      <TimelineHeader window={bounds} scale={scale.value} today={data.today} {width} />

      <div class="flex min-h-0 flex-1">
        <!-- One column rather than a cell per row: it keeps its edge and its ground all the way
             down, however far the days are scrolled under it. -->
        <div class="sticky left-0 z-20 shrink-0 border-r border-line bg-surface" style="width:{NAME_WIDTH}px">
          <div class="flex items-center px-2" style="height:{ROW_HEIGHT}px">
            <span class="t-micro text-fg-faint">Stages</span>
          </div>

          {#each rows as row (row.item.id)}
            {@const task = row.item}
            {@const finished = task.status === "done" || task.status === "dropped"}
            <div
              class="group flex items-center gap-1 pr-2"
              style="height:{ROW_HEIGHT}px;padding-left:{6 + row.depth * 14}px"
            >
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
                onclick={() => add(task.id)}
                aria-label="Add subtask"
                class="bare-button size-5 opacity-0 group-hover:opacity-100"
              >
                <Plus size={12} />
              </button>
            </div>
          {/each}

          <div class="flex items-center px-1.5" style="height:{ROW_HEIGHT}px">
            <button type="button" onclick={() => add()} class="bare-button t-micro px-1.5 py-0.5">
              <Plus size={11} />
              Task
            </button>
          </div>
        </div>

        <div class="relative shrink-0" style="width:{width}px">
          <!-- The days behind everything: a line a column, weekends shaded, each stage's own edges
               carried down the rows under it, and today's mark over all of it. -->
          <div class="pointer-events-none absolute inset-0">
            {#each columns as column (column.key)}
              <div
                class="absolute inset-y-0 border-l border-line/70 {column.weekend ? 'bg-surface-alt/60' : ''}"
                style="left:{column.left}px;width:{column.width}px"
              ></div>
            {/each}
            {#each bands as band (band.stage.id)}
              <div
                class="absolute inset-y-0 border-l border-line-strong"
                style="left:{offsetOf(band.span.start, bounds, scale.value)}px"
              ></div>
              <div
                class="absolute inset-y-0 border-l border-line-strong"
                style="left:{offsetOf(addDays(band.span.end, 1), bounds, scale.value)}px"
              ></div>
            {/each}
            <div class="absolute inset-y-0 w-px bg-ink/50" style="left:{todayLeft}px"></div>
          </div>

          <div class="relative" style="height:{ROW_HEIGHT}px">
            {#each bands as band (band.stage.id)}
              <StageBand stage={band.stage} span={band.span} window={bounds} scale={scale.value} {drag} />
            {/each}
          </div>

          {#each rows as row (row.item.id)}
            {@const task = row.item}
            {@const span = spanOf(task.id, tasks)}
            {@const finished = task.status === "done" || task.status === "dropped"}
            <div
              class="relative"
              style="height:{ROW_HEIGHT}px"
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
                  tone={Math.max(0.3, 0.9 - row.depth * 0.2)}
                  label={task.title || "Untitled task"}
                  people={peopleOn(task)}
                  faded={finished}
                  selected={task.id === selectedId}
                  movable={Boolean(task.startsOn)}
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
                    class="t-micro pointer-events-none absolute inset-y-1 flex items-center rounded-sm border border-line-strong border-dashed px-1.5 text-fg-faint"
                    style="left:{offsetOf(hover.day, bounds, scale.value)}px;width:{NEW_TASK_DAYS *
                      scale.value.dayWidth}px"
                  >
                    Set dates
                  </span>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
