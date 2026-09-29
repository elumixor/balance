<script lang="ts">
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";
  import Dot from "./Dot.svelte";
  import NotionDatabases from "./NotionDatabases.svelte";
  import NotionWorkspaces from "./NotionWorkspaces.svelte";
  import Select from "./Select.svelte";
  import { categories } from "$lib/core/synced.svelte";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { configureNotion } from "$lib/projects/queries";
  import type { NotionConnection, NotionDatabase } from "$lib/projects/types";
  import { untrack } from "svelte";

  /**
   * Importing a database of projects, in the order the questions actually arise: which workspace,
   * which of its databases holds the projects, which sphere their hours come out of, and which
   * column is the line under their names. The answers are kept on the workspace, so opening this
   * again is changing them rather than starting over. Tasks are not asked about here: each
   * imported project's task database is found under its page, and linked by hand otherwise.
   */
  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const spheres = $derived(categories.all.filter((category) => !category.isBuffer));
  const NONE = "";

  let connection = $state<NotionConnection | null>(null);
  let database = $state<NotionDatabase | null>(null);
  let categoryId = $state("");
  let description = $state<string | null>(null);
  let importing = $state(false);
  let imported = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    untrack(() => choose(projectsData.usableConnections.find((one) => one.dataSourceId) ?? projectsData.usableConnections[0] ?? null));
    imported = null;
  });

  function choose(next: NotionConnection | null) {
    connection = next;
    database = null;
    categoryId = next?.categoryId || (spheres[0]?.id ?? "");
    description = next?.mapping.description ?? null;
  }

  function pickDatabase(next: NotionDatabase) {
    if (database && database.id !== next.id) description = null;
    database = next;
  }

  /** Only the columns that could hold a sentence — a date can't be a description. */
  const textual = $derived(
    (database?.properties ?? []).filter((property) => property.type === "rich_text" || property.type === "text"),
  );

  async function run() {
    if (!connection || !database || !categoryId) return;
    importing = true;
    try {
      store.notion.set(
        await configureNotion({
          connectionId: connection.id,
          dataSourceId: database.id,
          categoryId,
          mapping: { description },
        }),
      );
      const summary = await projectsData.mirror(true);
      imported = summary
        ? `${count(summary.projects, "project")}, ${count(summary.tasks, "task")}, ${count(summary.people, "person", "people")}.`
        : "Nothing came back — try again in a moment.";
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't import from Notion" });
    } finally {
      importing = false;
    }
  }

  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
</script>

<Dialog title="Import projects from Notion" {open} {onclose}>
  <section class="space-y-2">
    <h3 class="t-micro px-2 text-fg-muted">Workspace</h3>
    <NotionWorkspaces selected={connection?.id ?? null} onselect={choose} />
  </section>

  {#if connection}
    <section class="space-y-2">
      <h3 class="t-micro px-2 text-fg-muted">Projects database</h3>
      <NotionDatabases
        connectionId={connection.id}
        selected={database?.id ?? (connection.dataSourceId || null)}
        onselect={pickDatabase}
      />
    </section>
  {/if}

  {#if database}
    <section class="space-y-2">
      <h3 class="t-micro px-2 text-fg-muted">Sphere their hours come from</h3>
      <div class="flex flex-wrap gap-1.5 px-2">
        {#each spheres as sphere (sphere.id)}
          <button
            type="button"
            aria-pressed={sphere.id === categoryId}
            onclick={() => (categoryId = sphere.id)}
            class="chip-outline {sphere.id === categoryId ? 'border-ink text-fg' : ''}"
          >
            <Dot color={sphere.color} size={7} />
            {sphere.name || "Unnamed"}
          </button>
        {/each}
      </div>
    </section>

    <section class="flex min-h-10 items-center gap-2 px-2">
      <span class="t-label flex-1 text-fg">Line under a project’s name</span>
      <Select
        label="Description column"
        width={180}
        value={description ?? NONE}
        options={[{ value: NONE, label: "None" }, ...textual.map((one) => ({ value: one.name, label: one.name }))]}
        onchange={(value) => (description = value || null)}
      />
    </section>
  {/if}

  <div class="flex items-center justify-between gap-3">
    <p class="t-micro text-fg-faint">{imported ?? "Tasks come from the task database under each project’s page."}</p>
    <Button
      label={importing ? "Importing…" : connection?.dataSourceId ? "Save and sync" : "Import"}
      disabled={!database || !categoryId || importing}
      onclick={() => void run()}
    />
  </div>
</Dialog>
