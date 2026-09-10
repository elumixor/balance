<script lang="ts">
  import { Avatars } from "$lib/components";
  import { barOf, type Span, spanOf } from "$lib/projects/gantt";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Task } from "$lib/projects/types";
  import TaskSheet from "./TaskSheet.svelte";

  /**
   * One task as a bar. A task with no dates of its own and no dated children has nowhere to sit,
   * so it draws as a line of text instead of being dropped — undated work is still work.
   */
  let {
    task,
    depth,
    bounds,
    tasks,
    color,
  }: { task: Task; depth: number; bounds: Span; tasks: readonly Task[]; color: string } = $props();

  const span = $derived(spanOf(task.id, tasks));
  const bar = $derived(span ? barOf(span, bounds) : null);
  const people = $derived(
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one)),
  );
  /** Depth reads as weight: the deeper the task, the lighter the bar it draws. */
  const alpha = $derived(Math.max(0.25, 0.85 - depth * 0.18));
  const finished = $derived(task.status === "done" || task.status === "dropped");

  let open = $state(false);
</script>

<div class="relative h-6" style="padding-left:{depth * 10}px">
  {#if bar}
    <button
      type="button"
      onclick={() => (open = true)}
      style="left:{bar.leftPercent}%;width:{bar.widthPercent}%;background:{color};opacity:{finished ? 0.35 : alpha}"
      class="press absolute inset-y-0 flex items-center gap-1.5 rounded-md px-2 text-left"
    >
      <span class="t-micro min-w-0 flex-1 truncate text-white {finished ? 'line-through' : ''}">
        {task.title || "Untitled task"}
      </span>
      <Avatars {people} size={14} max={2} />
    </button>
  {:else}
    <button type="button" onclick={() => (open = true)} class="t-micro press flex h-full items-center text-fg-faint">
      {task.title || "Untitled task"} — no dates yet
    </button>
  {/if}
</div>

<TaskSheet {task} {open} onclose={() => (open = false)} />
