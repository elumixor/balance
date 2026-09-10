<script lang="ts">
  import { Dialog, Field, Textarea } from "$lib/components";
  import { people } from "$lib/core/synced.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Task, TaskPriority, TaskStatus } from "$lib/projects/types";
  import { ExternalLink, Trash2 } from "lucide-svelte";

  /**
   * One task, opened. Everything a bar can't say: what it is for, when it runs, whose it is and
   * how big it is thought to be. A task mirrored from Notion says so, and links back to the page
   * that owns it — its title, status and dates are written there on the next sync.
   */
  let { task, open, onclose }: { task: Task; open: boolean; onclose: () => void } = $props();

  const STATUSES: { value: TaskStatus; label: string }[] = [
    { value: "todo", label: "To do" },
    { value: "doing", label: "Doing" },
    { value: "blocked", label: "Blocked" },
    { value: "done", label: "Done" },
    { value: "dropped", label: "Dropped" },
  ];
  const PRIORITIES: { value: TaskPriority; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "critical", label: "Critical" },
  ];

  const stages = $derived(data.stagesOf(task.projectId));

  function remove() {
    data.removeTask(task);
    onclose();
  }
</script>

<Dialog title="Task" {open} {onclose}>
  <div class="space-y-4">
    <Field
      value={task.title}
      placeholder="What is this?"
      ariaLabel="Task title"
      oninput={(title) => data.updateTask(task.id, { title })}
    />

    <Textarea
      value={task.description}
      placeholder="Anything worth remembering when it starts."
      oninput={(description) => data.updateTask(task.id, { description })}
    />

    <div class="grid grid-cols-2 gap-3">
      <label class="t-micro space-y-1 text-fg-muted">
        Status
        <select
          class="field-boxed w-full"
          value={task.status}
          onchange={(e) => data.updateTask(task.id, { status: e.currentTarget.value as TaskStatus })}
        >
          {#each STATUSES as status (status.value)}
            <option value={status.value}>{status.label}</option>
          {/each}
        </select>
        {#if task.statusLabel && !STATUSES.some((one) => one.label === task.statusLabel)}
          <span class="t-micro block text-fg-faint">Notion calls this “{task.statusLabel}”.</span>
        {/if}
      </label>

      <label class="t-micro space-y-1 text-fg-muted">
        Priority
        <select
          class="field-boxed w-full"
          value={task.priority ?? ""}
          onchange={(e) =>
            data.updateTask(task.id, { priority: (e.currentTarget.value || null) as TaskPriority | null })}
        >
          <option value="">None</option>
          {#each PRIORITIES as priority (priority.value)}
            <option value={priority.value}>{priority.label}</option>
          {/each}
        </select>
      </label>

      <label class="t-micro space-y-1 text-fg-muted">
        Starts
        <input
          type="date"
          class="field-boxed w-full"
          value={task.startsOn ?? ""}
          onchange={(e) => data.updateTask(task.id, { startsOn: e.currentTarget.value || null })}
        />
      </label>

      <label class="t-micro space-y-1 text-fg-muted">
        Ends
        <input
          type="date"
          class="field-boxed w-full"
          value={task.endsOn ?? ""}
          onchange={(e) => data.updateTask(task.id, { endsOn: e.currentTarget.value || null })}
        />
      </label>

      <label class="t-micro space-y-1 text-fg-muted">
        Stage
        <select
          class="field-boxed w-full"
          value={task.stageId ?? ""}
          onchange={(e) => data.updateTask(task.id, { stageId: e.currentTarget.value || null })}
        >
          <option value="">No stage</option>
          {#each stages as stage (stage.id)}
            <option value={stage.id}>{stage.name || "Stage"}</option>
          {/each}
        </select>
      </label>

      <label class="t-micro space-y-1 text-fg-muted">
        Estimate (hours)
        <Field
          value={task.estimateHours === null ? "" : String(task.estimateHours)}
          numeric
          inputmode="decimal"
          placeholder="—"
          ariaLabel="Estimate in hours"
          oninput={(value) =>
            data.updateTask(task.id, { estimateHours: value.trim() === "" ? null : Number(value) || null })}
        />
      </label>
    </div>

    <div class="space-y-1">
      <span class="t-micro text-fg-muted">Who is on it</span>
      <div class="flex flex-wrap gap-1.5">
        {#each people.all as person (person.id)}
          {@const on = task.assigneeIds.includes(person.id)}
          <button
            type="button"
            onclick={() =>
              data.updateTask(task.id, {
                assigneeIds: on
                  ? task.assigneeIds.filter((id) => id !== person.id)
                  : [...task.assigneeIds, person.id],
              })}
            class="press t-micro rounded-full border px-2 py-0.5 {on
              ? 'border-ink text-fg'
              : 'border-line text-fg-faint'}"
          >
            {person.name}
          </button>
        {/each}
        {#if people.all.length === 0}
          <span class="t-micro text-fg-faint">Nobody yet — people arrive with a mirrored workspace.</span>
        {/if}
      </div>
    </div>

    <div class="flex items-center justify-between">
      {#if task.notionUrl}
        <a
          href={task.notionUrl}
          target="_blank"
          rel="noreferrer"
          class="t-micro flex items-center gap-1.5 text-fg-muted underline-offset-2 hover:underline"
        >
          <ExternalLink size={12} />
          Open in Notion
        </a>
      {:else}
        <span></span>
      {/if}
      <button type="button" onclick={remove} class="press t-micro flex items-center gap-1.5 text-danger">
        <Trash2 size={12} />
        Delete
      </button>
    </div>
  </div>
</Dialog>
