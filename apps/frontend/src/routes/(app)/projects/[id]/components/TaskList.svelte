<script lang="ts">
  import { Avatars, Field } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Task } from "$lib/projects/types";
  import { Check, CircleDashed, Plus } from "lucide-svelte";

  /**
   * The same tasks as an outline. A row's title is typed in place, the tick is the one gesture
   * that changes anything without opening it, and a subtask is added under the row it belongs to
   * — so the shape of the plan is edited where the plan is read.
   */
  let {
    projectId,
    selectedId,
    onselect,
  }: { projectId: string; selectedId: string | null; onselect: (id: string | null) => void } = $props();

  const stages = $derived(data.stagesOf(projectId));
  const loose = $derived(data.taskRowsOf(projectId, null));

  const peopleOn = (task: Task) =>
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one));

  const toggle = (task: Task) => data.updateTask(task.id, { status: task.status === "done" ? "todo" : "done" });

  function add(stageId: string | null, parentId: string | null = null) {
    onselect(data.addTask(projectId, stageId, parentId).id);
  }
</script>

{#snippet rows(stageId: string | null)}
  {#each data.taskRowsOf(projectId, stageId) as row (row.item.id)}
    {@const task = row.item}
    {@const done = task.status === "done"}
    <li
      class="group flex items-center gap-2 rounded-md py-0.5 pr-1 {task.id === selectedId ? 'bg-surface-alt' : ''}"
      style="padding-left:{row.depth * 18}px"
    >
      <button
        type="button"
        onclick={() => toggle(task)}
        aria-label={done ? "Mark as to do" : "Mark as done"}
        class="bare-button size-6"
      >
        {#if done}<Check size={13} class="text-positive" />{:else}<CircleDashed size={13} />{/if}
      </button>

      <Field
        value={task.title}
        variant="bare"
        placeholder="Untitled task"
        ariaLabel="Task title"
        oninput={(title) => data.updateTask(task.id, { title })}
        class={done ? "text-fg-faint line-through" : ""}
      />

      {#if task.endsOn}
        <button
          type="button"
          onclick={() => onselect(task.id === selectedId ? null : task.id)}
          class="t-data-micro shrink-0 rounded-sm px-1 text-fg-faint"
        >
          {new Date(`${task.endsOn}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </button>
      {/if}
      <Avatars people={peopleOn(task)} size={16} max={2} />

      <button
        type="button"
        onclick={() => add(task.stageId, task.id)}
        aria-label="Add subtask"
        class="bare-button size-6 opacity-0 group-hover:opacity-100"
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        onclick={() => onselect(task.id === selectedId ? null : task.id)}
        aria-label="Open task"
        class="bare-button size-6 {task.id === selectedId ? 'text-fg' : ''}"
      >
        <span class="t-micro">…</span>
      </button>
    </li>
  {/each}
{/snippet}

<div class="space-y-4">
  {#each stages as stage (stage.id)}
    {@const completion = data.completionOf(projectId, stage.id)}
    <section class="space-y-1">
      <h3 class="t-label flex items-center gap-2 px-1 text-fg-muted">
        <Field
          value={stage.name}
          variant="bare"
          placeholder="Stage"
          ariaLabel="Stage name"
          oninput={(name) => data.updateStage(stage.id, { name })}
        />
        {#if completion.total > 0}
          <span class="t-data-micro shrink-0 text-fg-faint">{completion.done}/{completion.total}</span>
        {/if}
      </h3>
      <ul class="space-y-px">
        {@render rows(stage.id)}
      </ul>
      <button type="button" onclick={() => add(stage.id)} class="bare-button t-micro px-1.5 py-0.5">
        <Plus size={11} />
        Task
      </button>
    </section>
  {/each}

  {#if loose.length > 0 || stages.length === 0}
    <section class="space-y-1">
      {#if stages.length > 0}
        <h3 class="t-label px-1 text-fg-muted">No stage</h3>
      {/if}
      <ul class="space-y-px">
        {@render rows(null)}
      </ul>
      <button type="button" onclick={() => add(null)} class="bare-button t-micro px-1.5 py-0.5">
        <Plus size={11} />
        Task
      </button>
    </section>
  {/if}
</div>
