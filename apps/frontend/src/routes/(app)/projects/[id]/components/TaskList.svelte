<script lang="ts">
  import { Avatars, Field } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Task } from "$lib/projects/types";
  import { Check, ChevronRight, CircleDashed, Plus } from "lucide-svelte";
  import TaskSheet from "./TaskSheet.svelte";

  /**
   * The same tasks as a list: the plan read as an outline rather than as time. A row's title is
   * typed in place, the tick is the one gesture that changes anything without opening it, and a
   * subtask is added under the row it belongs to.
   */
  let { projectId, stageId = null }: { projectId: string; stageId?: string | null } = $props();

  const rows = $derived(data.taskRowsOf(projectId, stageId));
  let openId = $state<string | null>(null);

  const peopleOn = (task: Task) =>
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one));

  const toggle = (task: Task) =>
    data.updateTask(task.id, { status: task.status === "done" ? "todo" : "done" });
</script>

<ul class="divide-y divide-line rounded-lg border border-line bg-surface">
  {#each rows as row (row.item.id)}
    {@const task = row.item}
    {@const done = task.status === "done"}
    <li class="group flex items-center gap-2 px-3 py-1.5" style="padding-left:{12 + row.depth * 18}px">
      <button
        type="button"
        onclick={() => toggle(task)}
        aria-label={done ? "Mark as to do" : "Mark as done"}
        class="press shrink-0 text-fg-faint"
      >
        {#if done}
          <Check size={14} class="text-positive" />
        {:else}
          <CircleDashed size={14} />
        {/if}
      </button>

      <Field
        value={task.title}
        variant="bare"
        placeholder="Untitled task"
        ariaLabel="Task title"
        oninput={(title) => data.updateTask(task.id, { title })}
        class="t-body {done ? 'text-fg-faint line-through' : ''}"
      />

      {#if task.endsOn}
        <span class="t-micro shrink-0 tabular-nums text-fg-faint">{task.endsOn.slice(5)}</span>
      {/if}
      <Avatars people={peopleOn(task)} size={16} max={2} />

      <button
        type="button"
        onclick={() => data.addTask(projectId, task.stageId, task.id)}
        aria-label="Add subtask"
        class="press hoverable rounded-sm p-0.5 text-fg-faint opacity-0 group-hover:opacity-100"
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        onclick={() => (openId = task.id)}
        aria-label="Open task"
        class="press hoverable rounded-sm p-0.5 text-fg-faint"
      >
        <ChevronRight size={13} />
      </button>

      <TaskSheet {task} open={openId === task.id} onclose={() => (openId = null)} />
    </li>
  {/each}

  <li class="px-3 py-1.5">
    <button
      type="button"
      onclick={() => data.addTask(projectId, stageId)}
      class="press hoverable t-micro flex items-center gap-1.5 rounded-md text-fg-faint"
    >
      <Plus size={12} />
      Task
    </button>
  </li>
</ul>
