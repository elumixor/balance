<script lang="ts">
  import { goto } from "$app/navigation";
  import { Screen, Skeleton } from "$lib/components";
  import { Dot } from "$lib/components";
  import { synced } from "$lib/core/synced.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { rowsOf } from "$lib/projects/tree";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { Plus, RefreshCw } from "lucide-svelte";
  import { EmptyState, PracticeRow, ProjectRow } from "./components";

  /**
   * Everything the hours are for, as one column per sphere: the projects under it in the tree
   * they actually form, and the practices that never complete beneath them. A mirrored workspace
   * is checked when the screen opens, so the tree is what Notion said a moment ago.
   */
  void data.enter();

  function add(categoryId: string) {
    const created = data.create(null, categoryId);
    if (created) void goto(`/projects/${created.id}`);
  }

  /** ⌘Z takes back the last edit here — a project made, a practice renamed, a stage cut. */
  function onkeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const redo = key === "y" || (key === "z" && e.shiftKey);
    if (key !== "z" && !redo) return;
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    if (redo) synced.redo();
    else synced.undo();
  }
</script>

<svelte:window {onkeydown} />

<Screen title="Projects" wide>
  {#if data.notion?.connected}
    <button
      type="button"
      onclick={() => void data.mirror(true)}
      class="press hoverable t-micro mb-4 flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-fg-muted"
    >
      <RefreshCw size={12} />
      {data.notion.needsReconnect ? "Reconnect Notion" : `Sync ${data.notion.workspaceName || "Notion"}`}
    </button>
  {/if}

  {#if !data.ready}
    <div class="space-y-2">
      {#each [0, 1, 2] as i (i)}
        <Skeleton height={52} radius={10} />
      {/each}
    </div>
  {:else}
    {#if data.spheres.length === 0}
      <EmptyState title="Cut the week into spheres first." hint="Projects live under the categories on the planning ring." />
    {/if}

    <div class="space-y-10">
      {#each data.groups as group (group.category.id)}
        <section class="space-y-2">
          <h2 class="t-heading flex items-center gap-2.5" style="color:{group.category.color}">
            <Dot color={group.category.color} size={10} />
            {group.category.name || "Unnamed sphere"}
            <span class="t-micro tabular-nums font-normal text-fg-faint">
              {formatHoursDecimal(group.claimed)} / {formatHoursDecimal(group.category.targetHoursPerWeek)}h claimed
            </span>
          </h2>

          {#each rowsOf(group.nodes) as row (row.item.id)}
            <div class="list-item-in"><ProjectRow card={data.cardOf(row.item)} depth={row.depth} /></div>
          {/each}

          <button
            type="button"
            onclick={() => add(group.category.id)}
            class="press hoverable flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-fg-muted"
          >
            <Plus size={14} />
            <span class="t-label">New project</span>
          </button>

          {#if group.practices.length > 0}
            <div class="divide-y divide-line rounded-lg border border-line bg-surface px-3">
              {#each group.practices as practice (practice.id)}
                <PracticeRow
                  {practice}
                  progress={data.progress?.practices[practice.id] ?? null}
                  color={group.category.color}
                />
              {/each}
            </div>
          {/if}
          <button
            type="button"
            onclick={() => data.createPractice(group.category.id)}
            class="press hoverable -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-fg-faint"
          >
            <Plus size={13} />
            <span class="t-micro">Practice — recurring, never completes</span>
          </button>
        </section>
      {/each}
    </div>
  {/if}
</Screen>
