<script lang="ts">
  import { Avatar, CardRow, DateField, Field, NotionMark, NumberField, PersonField, Select, Textarea } from "$lib/components";
  import type { Person } from "$lib/people/types";
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

  const assignees = $derived(
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one)),
  );
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

<div class="mx-auto max-w-5xl space-y-0.5 p-2">
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

  <!-- Whose it is: a chip per assignee, and the app's one person field to add another. -->
  <CardRow icon={UserRound} set={task.assigneeIds.length > 0} align="start">
    <div class="min-w-0 flex-1 space-y-1 py-1">
      {#each assignees as person (person.id)}
        <div class="group flex items-center gap-2">
          <Avatar {person} size={18} />
          <span class="t-label min-w-0 flex-1 truncate text-fg">{person.name}</span>
          <button
            type="button"
            aria-label="Unassign {person.name}"
            onclick={() => data.updateTask(task.id, { assigneeIds: task.assigneeIds.filter((id) => id !== person.id) })}
            class="press-sm shrink-0 rounded p-0.5 text-fg-faint opacity-0 group-hover:opacity-100 hover:text-fg
              focus-visible:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      {/each}
      <PersonField
        taken={task.assigneeIds}
        placeholder={assignees.length > 0 ? "Add someone" : "Assign to"}
        onpick={(person) => data.updateTask(task.id, { assigneeIds: [...task.assigneeIds, person.id] })}
      />
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
