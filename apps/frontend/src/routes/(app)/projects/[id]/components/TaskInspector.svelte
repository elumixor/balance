<script lang="ts">
  import { CardRow, DateField, Field, NotionMark, NumberField, Select, Textarea } from "$lib/components";
  import { people } from "$lib/core/synced.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Task, TaskPriority, TaskStatus } from "$lib/projects/types";
  import { AlignLeft, CalendarRange, CircleDot, Flag, Hourglass, Layers, Trash2, UserRound, X } from "lucide-svelte";

  /**
   * One task, opened in place under the row that opens it — a panel rather than a dialog, so the
   * plan it belongs to stays on screen while it is edited. The rows are the event card's rows,
   * because a thing with a name, a time and somebody attached to it is the same shape here.
   */
  let { task, onclose }: { task: Task; onclose: () => void } = $props();

  const STATUSES: { value: TaskStatus; label: string }[] = [
    { value: "todo", label: "To do" },
    { value: "doing", label: "Doing" },
    { value: "blocked", label: "Blocked" },
    { value: "done", label: "Done" },
    { value: "dropped", label: "Dropped" },
  ];
  const PRIORITIES: { value: TaskPriority | ""; label: string }[] = [
    { value: "", label: "No priority" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "critical", label: "Critical" },
  ];

  const stages = $derived(data.stagesOf(task.projectId));
  const stageOptions = $derived([
    { value: "", label: "No stage" },
    ...stages.map((stage) => ({ value: stage.id, label: stage.name || "Stage" })),
  ]);

  function remove() {
    data.removeTask(task);
    onclose();
  }
</script>

<div class="space-y-0.5 rounded-lg border border-line bg-surface p-2">
  <div class="flex items-center gap-1">
    <Field
      value={task.title}
      variant="bare"
      placeholder="Untitled task"
      ariaLabel="Task title"
      oninput={(title) => data.updateTask(task.id, { title })}
      class="t-body-strong"
    />
    <button type="button" onclick={onclose} aria-label="Close" class="bare-button size-7"><X size={14} /></button>
  </div>

  <CardRow icon={CircleDot} set>
    <Select
      variant="bare"
      label="Status"
      value={task.status}
      options={STATUSES}
      onchange={(status) => data.updateTask(task.id, { status })}
    />
    {#if task.statusLabel && !STATUSES.some((one) => one.label === task.statusLabel)}
      <span class="t-micro text-fg-faint">“{task.statusLabel}” in Notion</span>
    {/if}
  </CardRow>

  <CardRow icon={CalendarRange} set={Boolean(task.startsOn)}>
    <DateField
      value={task.startsOn}
      ariaLabel="Starts on"
      placeholder="No dates"
      onchange={(startsOn) => data.updateTask(task.id, { startsOn })}
    />
    {#if task.startsOn}
      <span class="t-micro text-fg-faint">→</span>
      <DateField
        value={task.endsOn}
        ariaLabel="Ends on"
        placeholder="same day"
        onchange={(endsOn) => data.updateTask(task.id, { endsOn })}
      />
    {/if}
  </CardRow>

  <CardRow icon={UserRound} set={task.assigneeIds.length > 0}>
    <div class="flex flex-wrap gap-1">
      {#each people.all as person (person.id)}
        {@const on = task.assigneeIds.includes(person.id)}
        <button
          type="button"
          onclick={() =>
            data.updateTask(task.id, {
              assigneeIds: on ? task.assigneeIds.filter((id) => id !== person.id) : [...task.assigneeIds, person.id],
            })}
          class="press t-micro flex items-center gap-1.5 rounded-full border px-2 py-0.5
            {on ? 'border-ink text-fg' : 'border-line text-fg-faint'}"
        >
          <span class="size-2 rounded-full" style="background:{person.color}"></span>
          {person.name}
        </button>
      {/each}
      {#if people.all.length === 0}
        <span class="t-micro px-1 text-fg-faint">Nobody yet — people arrive with a mirrored workspace.</span>
      {/if}
    </div>
  </CardRow>

  <CardRow icon={Layers} set={Boolean(task.stageId)}>
    <Select
      variant="bare"
      label="Stage"
      value={task.stageId ?? ""}
      options={stageOptions}
      onchange={(stageId) => data.updateTask(task.id, { stageId: stageId || null })}
    />
  </CardRow>

  <CardRow icon={Flag} set={Boolean(task.priority)}>
    <Select
      variant="bare"
      label="Priority"
      value={task.priority ?? ""}
      options={PRIORITIES}
      onchange={(priority) => data.updateTask(task.id, { priority: priority || null })}
    />
  </CardRow>

  <CardRow icon={Hourglass} set={task.estimateHours !== null}>
    <NumberField
      value={task.estimateHours ?? 0}
      unit="h"
      ariaLabel="Estimate in hours"
      onchange={(hours) => data.updateTask(task.id, { estimateHours: hours > 0 ? hours : null })}
    />
    <span class="t-micro text-fg-faint">thought to be</span>
  </CardRow>

  <CardRow icon={AlignLeft} align="start" set={Boolean(task.description.trim())}>
    <Textarea
      value={task.description}
      variant="bare"
      rows={2}
      placeholder="Anything worth remembering when it starts."
      ariaLabel="Description"
      oninput={(description) => data.updateTask(task.id, { description })}
    />
  </CardRow>

  <div class="flex items-center justify-between px-1.5 pt-1">
    {#if task.notionUrl}
      <a
        href={task.notionUrl}
        target="_blank"
        rel="noreferrer"
        class="t-micro flex items-center gap-1.5 text-fg-faint underline-offset-2 hover:underline"
      >
        <NotionMark size={11} />
        Open in Notion
      </a>
    {:else}
      <span></span>
    {/if}
    <button type="button" onclick={remove} class="bare-button t-micro px-1.5 py-1 hover:text-danger">
      <Trash2 size={12} />
      Delete
    </button>
  </div>
</div>
