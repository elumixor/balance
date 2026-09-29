<script lang="ts">
  import { Button, Dialog, NotionDatabases, NotionWorkspaces, Select } from "$lib/components";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { NotionDatabase, NotionTaskMapping, Project } from "$lib/projects/types";
  import { CalendarRange, CircleDot, ListTree, UserRound } from "lucide-svelte";
  import { untrack } from "svelte";

  /**
   * Where a project's tasks live in Notion, asked in the order it is decided: which workspace
   * (under whichever Notion login granted it), which database in it, and what that board's
   * columns mean. Each of the four things the timeline reads — where a task is, when, whose, and
   * what it sits under — is its own row with only the columns that could answer it, pre-set to
   * what the board suggests, so pressing straight through is usually right.
   */
  let { project, open, onclose }: { project: Project; open: boolean; onclose: () => void } = $props();

  type Key = keyof NotionTaskMapping;

  const ROWS: { key: Key; label: string; icon: typeof CircleDot; types: readonly string[] }[] = [
    { key: "status", label: "Status", icon: CircleDot, types: ["status", "select"] },
    { key: "dates", label: "Dates", icon: CalendarRange, types: ["date"] },
    { key: "assignee", label: "Assignee", icon: UserRound, types: ["people", "relation"] },
    { key: "parent", label: "Parent task", icon: ListTree, types: ["relation"] },
  ];
  const NONE = "";

  let connectionId = $state<string | null>(null);
  let database = $state<NotionDatabase | null>(null);
  let mapping = $state<NotionTaskMapping | null>(null);
  let working = $state(false);

  // Opening starts from what the project is linked to, or from the first workspace that works.
  $effect(() => {
    if (!open) return;
    connectionId = untrack(() => project.notionConnectionId ?? data.usableConnections[0]?.id ?? null);
    database = null;
    mapping = null;
  });

  function pickDatabase(next: NotionDatabase) {
    database = next;
    const own = next.id === project.notionTasksDataSourceId ? project.notionTaskMapping : null;
    mapping = { ...(own ?? next.suggested) };
  }

  const statusOptions = $derived(
    database?.properties.find((column) => column.name === mapping?.status)?.options ?? [],
  );

  function optionsFor(types: readonly string[]) {
    const columns = (database?.properties ?? []).filter((column) => types.includes(column.type));
    return [{ value: NONE, label: "None" }, ...columns.map((column) => ({ value: column.name, label: column.name }))];
  }

  async function link() {
    if (!connectionId || !database || !mapping) return;
    working = true;
    try {
      await data.link(project.id, { connectionId, dataSourceId: database.id, mapping });
      onclose();
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't link that database" });
    } finally {
      working = false;
    }
  }

  async function unlink() {
    working = true;
    try {
      await data.unlink(project.id);
      onclose();
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't unlink this project" });
    } finally {
      working = false;
    }
  }
</script>

<Dialog title="Tasks from Notion" {open} {onclose}>
  <section class="space-y-2">
    <h3 class="t-micro px-2 text-fg-muted">Workspace</h3>
    <NotionWorkspaces
      selected={connectionId}
      onselect={(connection) => {
        connectionId = connection.id;
        database = null;
        mapping = null;
      }}
    />
  </section>

  {#if connectionId}
    <section class="space-y-2">
      <h3 class="t-micro px-2 text-fg-muted">Task database</h3>
      <NotionDatabases
        {connectionId}
        selected={database?.id ?? project.notionTasksDataSourceId}
        onselect={pickDatabase}
      />
    </section>
  {/if}

  {#if database && mapping}
    {@const chosen = mapping}
    <section class="space-y-1">
      <h3 class="t-micro px-2 text-fg-muted">Columns</h3>
      {#each ROWS as row (row.key)}
        {@const Icon = row.icon}
        <div class="flex min-h-10 items-center gap-2 px-2">
          <Icon size={14} class="shrink-0 text-fg-faint" />
          <span class="t-label flex-1 text-fg">{row.label}</span>
          <Select
            label={row.label}
            width={180}
            value={chosen[row.key] ?? NONE}
            options={optionsFor(row.types)}
            onchange={(value) => (mapping = { ...chosen, [row.key]: value || null })}
          />
        </div>
        {#if row.key === "status" && statusOptions.length > 0}
          <p class="t-micro truncate pb-1 pl-8 text-fg-faint">{statusOptions.join(" · ")}</p>
        {/if}
      {/each}
    </section>
  {/if}

  <div class="flex items-center justify-between gap-3">
    {#if project.notionConnectionId}
      <Button variant="bare" label="Unlink" disabled={working} onclick={() => void unlink()} />
    {:else}
      <span></span>
    {/if}
    <Button
      label={working ? "Syncing…" : project.notionConnectionId ? "Save and sync" : "Link and sync"}
      disabled={!database || working}
      onclick={() => void link()}
    />
  </div>
</Dialog>
