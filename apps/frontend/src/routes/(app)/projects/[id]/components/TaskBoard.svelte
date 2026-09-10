<script lang="ts">
  import { Avatars } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Task, TaskStatus } from "$lib/projects/types";
  import { Plus } from "lucide-svelte";

  /**
   * The same tasks as columns. The four the app counts by, never the board's own — a mirrored
   * project can have eleven columns, and a wall of them says less than where the work stands.
   * What the other board calls the column is on the card, under the title.
   */
  let {
    projectId,
    selectedId,
    onselect,
  }: { projectId: string; selectedId: string | null; onselect: (id: string | null) => void } = $props();

  const COLUMNS: { status: TaskStatus; label: string }[] = [
    { status: "todo", label: "To do" },
    { status: "doing", label: "Doing" },
    { status: "blocked", label: "Blocked" },
    { status: "done", label: "Done" },
  ];

  const tasks = $derived(data.tasksOf(projectId).filter((task) => task.status !== "dropped"));

  const peopleOn = (task: Task) =>
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one));
</script>

<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  {#each COLUMNS as column (column.status)}
    {@const own = tasks.filter((task) => task.status === column.status)}
    <section class="space-y-1.5">
      <h3 class="t-label flex items-center justify-between px-1 text-fg-muted">
        {column.label}
        <span class="t-data-micro text-fg-faint">{own.length}</span>
      </h3>

      {#each own as task (task.id)}
        <button
          type="button"
          onclick={() => onselect(task.id === selectedId ? null : task.id)}
          class="press-sm block w-full space-y-1 rounded-md border border-line bg-surface p-2 text-left
            {task.id === selectedId ? 'border-line-strong' : ''}"
        >
          <span class="t-label block text-fg">{task.title || "Untitled task"}</span>
          <span class="flex items-center justify-between gap-2">
            <span class="t-micro truncate text-fg-faint">
              {task.statusLabel && task.statusLabel !== column.label ? task.statusLabel : (task.endsOn ?? "")}
            </span>
            <Avatars people={peopleOn(task)} size={16} max={2} />
          </span>
        </button>
      {/each}

      {#if column.status === "todo"}
        <button
          type="button"
          onclick={() => onselect(data.addTask(projectId, null).id)}
          class="bare-button t-micro w-full justify-start px-1.5 py-1"
        >
          <Plus size={11} />
          Task
        </button>
      {/if}
    </section>
  {/each}
</div>
