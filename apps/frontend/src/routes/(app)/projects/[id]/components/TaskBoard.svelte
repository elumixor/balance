<script lang="ts">
  import { Avatars } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Task, TaskStatus } from "$lib/projects/types";
  import { Plus } from "lucide-svelte";
  import TaskSheet from "./TaskSheet.svelte";

  /**
   * The same tasks as columns. The four the app counts by, never the board's own — a mirrored
   * project can have eleven columns, and a wall of them says less than where the work stands.
   * What the other board calls the column is on the card, under the title.
   */
  let { projectId }: { projectId: string } = $props();

  const COLUMNS: { status: TaskStatus; label: string }[] = [
    { status: "todo", label: "To do" },
    { status: "doing", label: "Doing" },
    { status: "blocked", label: "Blocked" },
    { status: "done", label: "Done" },
  ];

  const tasks = $derived(data.tasksOf(projectId).filter((task) => task.status !== "dropped"));
  let openId = $state<string | null>(null);

  const peopleOn = (task: Task) =>
    task.assigneeIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one));
</script>

<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  {#each COLUMNS as column (column.status)}
    {@const own = tasks.filter((task) => task.status === column.status)}
    <section class="space-y-2 rounded-lg border border-line bg-surface p-2">
      <h3 class="t-micro flex items-center justify-between text-fg-muted">
        {column.label}
        <span class="tabular-nums text-fg-faint">{own.length}</span>
      </h3>

      {#each own as task (task.id)}
        <button
          type="button"
          onclick={() => (openId = task.id)}
          class="press hoverable block w-full space-y-1 rounded-md border border-line bg-bg p-2 text-left"
        >
          <span class="t-micro block text-fg">{task.title || "Untitled task"}</span>
          <span class="flex items-center justify-between gap-2">
            {#if task.statusLabel && task.statusLabel !== column.label}
              <span class="t-micro truncate text-fg-faint">{task.statusLabel}</span>
            {:else}
              <span></span>
            {/if}
            <Avatars people={peopleOn(task)} size={16} max={2} />
          </span>
        </button>
        <TaskSheet {task} open={openId === task.id} onclose={() => (openId = null)} />
      {/each}

      {#if column.status === "todo"}
        <button
          type="button"
          onclick={() => data.addTask(projectId, null)}
          class="press hoverable t-micro flex items-center gap-1.5 rounded-md py-1 text-fg-faint"
        >
          <Plus size={12} />
          Task
        </button>
      {/if}
    </section>
  {/each}
</div>
