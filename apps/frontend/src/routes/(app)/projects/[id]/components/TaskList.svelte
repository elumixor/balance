<script lang="ts">
  import { Button, Divider, NumberField } from "$lib/components";
  import type { Task } from "$lib/projects/types";
  import { Check, GripVertical, Plus, X } from "lucide-svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";

  /**
   * The checklist under the running stage. Optional all the way down: a task may carry an
   * estimate, and one that does can be picked up from the calendar's rail and dropped onto the
   * week — the grip is the hint. Nothing here is required for the gate; the gate counts evidence,
   * not ticks.
   */
  let { stageId, tasks }: { stageId: string; tasks: readonly Task[] } = $props();

  let draft = $state("");

  function add() {
    const title = draft.trim();
    if (!title) return;
    data.addTask(stageId, title);
    draft = "";
  }
</script>

<div>
  {#each tasks as task, i (task.id)}
    {#if i > 0}<Divider />{/if}
    <div class="flex items-center gap-2 py-1.5 {task.done ? 'opacity-60' : ''}">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? "Mark not done" : "Mark done"}
        onclick={() => data.updateTask(task.id, { done: !task.done })}
        class="press-sm flex size-5 shrink-0 items-center justify-center rounded-sm border {task.done
          ? 'border-ink bg-ink text-ink-fg'
          : 'border-line-strong'}"
      >
        {#if task.done}<Check size={12} strokeWidth={3} />{/if}
      </button>
      <input
        value={task.title}
        oninput={(e) => data.updateTask(task.id, { title: e.currentTarget.value })}
        aria-label="Task"
        class="field-bare field-sm flex-1 {task.done ? 'line-through' : ''}"
      />
      <NumberField
        value={task.estimateHours ?? 0}
        unit="h"
        size="sm"
        ariaLabel="Estimate in hours"
        onchange={(estimateHours) => data.updateTask(task.id, { estimateHours: estimateHours > 0 ? estimateHours : null })}
      />
      <span class="text-fg-faint" title="Drag onto the week from the calendar's rail"><GripVertical size={14} /></span>
      <Button variant="bare" title="Remove task" onclick={() => data.removeTask(task.id)}>
        {#snippet icon()}<X size={13} class="text-fg-faint" />{/snippet}
      </Button>
    </div>
  {/each}
  {#if tasks.length > 0}<Divider />{/if}
  <div class="flex items-center gap-2 py-1.5">
    <Plus size={14} class="ml-0.5 shrink-0 text-fg-faint" />
    <input
      bind:value={draft}
      placeholder="Add a subtask"
      aria-label="New subtask"
      onkeydown={(e) => e.key === "Enter" && add()}
      class="field-bare field-sm flex-1"
    />
  </div>
</div>
