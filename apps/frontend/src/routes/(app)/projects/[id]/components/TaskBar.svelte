<script lang="ts">
  import { Avatars } from "$lib/components";
  import { barOf, type Span, spanOf } from "$lib/projects/gantt";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Task } from "$lib/projects/types";

  /**
   * One task as a bar. A task with no dates of its own and no dated children has nowhere to sit,
   * so it draws as a line of text at the left instead of being dropped — undated work is still
   * work, and a plan that hides it is how it stays undated.
   */
  let {
    task,
    depth,
    bounds,
    tasks,
    color,
    selected,
    onselect,
  }: {
    task: Task;
    depth: number;
    bounds: Span;
    tasks: readonly Task[];
    color: string;
    selected: boolean;
    onselect: () => void;
  } = $props();

  const span = $derived(spanOf(task.id, tasks));
  const bar = $derived(span ? barOf(span, bounds) : null);
  const people = $derived(
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one)),
  );
  /** Depth reads as weight: the deeper the task, the lighter the bar it draws. */
  const alpha = $derived(Math.max(0.3, 0.9 - depth * 0.2));
  const finished = $derived(task.status === "done" || task.status === "dropped");
</script>

<div class="relative h-6">
  {#if bar}
    <button
      type="button"
      onclick={onselect}
      style="left:{bar.leftPercent}%;width:{bar.widthPercent}%;background:color-mix(in oklab,{color} {Math.round(
        (finished ? 0.3 : alpha) * 100,
      )}%,transparent);margin-left:{depth * 8}px"
      class="press-sm absolute inset-y-0.5 flex items-center gap-1.5 rounded-sm px-1.5 text-left
        {selected ? 'ring-2 ring-fg/25' : ''}"
    >
      <span class="t-micro min-w-0 flex-1 truncate text-fg {finished ? 'line-through opacity-70' : ''}">
        {task.title || "Untitled task"}
      </span>
      <Avatars {people} size={13} max={2} />
    </button>
  {:else}
    <button
      type="button"
      onclick={onselect}
      style="margin-left:{depth * 8}px"
      class="press-sm t-micro flex h-full items-center rounded-sm px-1.5 text-fg-faint {selected
        ? 'ring-2 ring-fg/25'
        : ''}"
    >
      {task.title || "Untitled task"} · no dates yet
    </button>
  {/if}
</div>
