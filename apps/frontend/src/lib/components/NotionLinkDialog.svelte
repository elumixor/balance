<script lang="ts">
  import { goto } from "$app/navigation";
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";
  import Field from "./Field.svelte";
  import LabeledField from "./LabeledField.svelte";
  import NotionSource from "./NotionSource.svelte";
  import Select from "./Select.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { listNotionAssignees, listNotionViews } from "$lib/projects/queries";
  import type { NotionAssignable, NotionDatabase, NotionTaskMapping, NotionView, Project } from "$lib/projects/types";
  import { CalendarRange, Check, CircleDot, ListFilter, ListTree, Type, UserRound, Users } from "lucide-svelte";
  import { untrack } from "svelte";

  /**
   * Where a project's tasks live in Notion, asked in the order it is decided, one dropdown under
   * the other: the workspace, the database in it, the saved view whose filter picks this
   * project's rows — so one board of every task can feed a project per view — which property
   * answers each of the four things the timeline reads, and whose tasks to keep: only yours, say,
   * from a board the whole team shares. Each property row offers only properties
   * of the right type, pre-set to what the board suggests, so pressing straight through is
   * usually right.
   *
   * Given no project it makes one: named after the database, under the sphere it was opened from.
   */
  let {
    project,
    categoryId,
    open,
    onclose,
  }: { project: Project | null; categoryId?: string; open: boolean; onclose: () => void } = $props();

  type Key = keyof NotionTaskMapping;

  const ROWS: { key: Key; label: string; icon: typeof CircleDot; types: readonly string[] }[] = [
    { key: "status", label: "Status", icon: CircleDot, types: ["status", "select", "checkbox"] },
    { key: "dates", label: "Dates", icon: CalendarRange, types: ["date"] },
    {
      key: "assignee",
      label: "Assignee",
      icon: UserRound,
      types: ["people", "relation", "created_by", "select", "multi_select", "formula"],
    },
    { key: "parent", label: "Parent task", icon: ListTree, types: ["relation"] },
  ];
  const NONE = "";

  let connectionId = $state<string | null>(null);
  let database = $state<NotionDatabase | null>(null);
  let views = $state<NotionView[] | null>(null);
  let viewId = $state<string>(NONE);
  let mapping = $state<NotionTaskMapping | null>(null);
  let name = $state("");
  /** Whose rows to keep — empty keeps everyone's — and who the assignee property can name. */
  let assignees = $state<string[]>([]);
  let people = $state<NotionAssignable[] | null>(null);
  let working = $state(false);

  // Opening starts from what the project is linked to, or from the first workspace that works.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      connectionId = project?.notionConnectionId ?? data.usableConnections[0]?.id ?? null;
      database = null;
      mapping = null;
      views = null;
      name = "";
    });
  });

  function pickDatabase(next: NotionDatabase | null) {
    database = next;
    views = null;
    if (!next) return;
    const own = next.id === project?.notionTasksDataSourceId;
    mapping = { ...((own ? project?.notionTaskMapping : null) ?? next.suggested) };
    viewId = own ? (project?.notionViewId ?? NONE) : NONE;
    assignees = own ? [...(project?.notionTaskFilter?.assignees ?? [])] : [];
    if (!project) name = next.name;
    const asked = next.id;
    listNotionViews(connectionId ?? "", asked)
      .then((found) => {
        if (database?.id === asked) views = found;
      })
      .catch((error: unknown) => {
        views = [];
        diagnostics.report("Notion", error, { title: "Couldn't read that database's views" });
      });
  }

  // Derived to primitives, so editing another row of the mapping doesn't read the people again.
  const assigneeProperty = $derived(mapping?.assignee ?? null);
  const sourceId = $derived(database?.id ?? null);

  // Whoever the chosen assignee property can name, read again when that property changes.
  $effect(() => {
    const property = assigneeProperty;
    const source = sourceId;
    const workspace = connectionId;
    people = null;
    if (!property || !source || !workspace) return;
    listNotionAssignees(workspace, source, property)
      .then((found) => {
        if (assigneeProperty === property && sourceId === source) people = found;
      })
      .catch((error: unknown) => {
        people = [];
        diagnostics.report("Notion", error, { title: "Couldn't read who that property names" });
      });
  });

  function toggle(id: string) {
    assignees = assignees.includes(id) ? assignees.filter((one) => one !== id) : [...assignees, id];
  }

  const statusColumn = $derived(database?.properties.find((column) => column.id === mapping?.status) ?? null);

  function optionsFor(types: readonly string[]) {
    const columns = (database?.properties ?? []).filter((column) => types.includes(column.type));
    return [{ value: NONE, label: "None" }, ...columns.map((column) => ({ value: column.id, label: column.name }))];
  }

  async function save() {
    if (!connectionId || !database || !mapping) return;
    working = true;
    try {
      const target = project ?? data.create(null, categoryId);
      if (!target) return;
      if (!project) data.update(target.id, { name: name.trim() || database.name });
      await data.link(target.id, {
        connectionId,
        dataSourceId: database.id,
        viewId: viewId || null,
        mapping,
        filter: { assignees: mapping.assignee ? assignees : [] },
      });
      onclose();
      if (!project) await goto(`/projects/${target.id}`);
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't link that database" });
    } finally {
      working = false;
    }
  }

  async function unlink() {
    if (!project) return;
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

<Dialog title={project ? "Tasks from Notion" : "New project from Notion"} {open} {onclose}>
  <div class="space-y-4">
    <NotionSource
      {connectionId}
      databaseId={database?.id ?? project?.notionTasksDataSourceId ?? null}
      onconnection={(id) => {
        connectionId = id;
        pickDatabase(null);
      }}
      ondatabase={pickDatabase}
    />

    {#if database && mapping}
      {@const chosen = mapping}
      {#if !project}
        <LabeledField icon={Type} label="Project name">
          <Field bind:value={name} placeholder={database.name} ariaLabel="Project name" />
        </LabeledField>
      {/if}

      <LabeledField icon={ListFilter} label="Rows from view" loading={views === null}>
        <Select
          full
          label="View"
          value={viewId}
          options={[{ value: NONE, label: "All rows" }, ...(views ?? []).map((view) => ({ value: view.id, label: view.name }))]}
          onchange={(value) => (viewId = value)}
        />
      </LabeledField>

      {#each ROWS as row (row.key)}
        <LabeledField icon={row.icon} label={row.label}>
          <Select
            full
            label={row.label}
            value={chosen[row.key] ?? NONE}
            options={optionsFor(row.types)}
            onchange={(value) => {
              mapping = { ...chosen, [row.key]: value || null };
              if (row.key === "assignee") assignees = [];
            }}
          />
          {#if row.key === "status" && statusColumn && statusColumn.options.length > 0}
            <p class="t-micro truncate pt-1 text-fg-faint">{statusColumn.options.join(" · ")}</p>
          {:else if row.key === "status" && statusColumn?.type === "checkbox"}
            <p class="t-micro pt-1 text-fg-faint">Ticked is done.</p>
          {/if}
        </LabeledField>

        {#if row.key === "assignee" && chosen.assignee}
          <LabeledField icon={Users} label="Only tasks for" loading={people === null}>
            {#if people?.length === 0}
              <p class="t-micro text-fg-faint">Nobody is named in that property yet.</p>
            {:else}
              <div class="flex flex-wrap gap-1.5">
                {#each people ?? [] as person (person.id)}
                  {@const on = assignees.includes(person.id)}
                  <button
                    type="button"
                    aria-pressed={on}
                    onclick={() => toggle(person.id)}
                    class="chip-outline {on ? 'border-ink text-fg' : ''}"
                  >
                    {#if on}<Check size={12} />{/if}
                    {person.me ? `${person.name} (you)` : person.name}
                  </button>
                {/each}
              </div>
              <p class="t-micro pt-1 text-fg-faint">
                {assignees.length === 0 ? "Everyone’s tasks." : "Tasks they sit under come along, so subtasks keep their place."}
              </p>
            {/if}
          </LabeledField>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="flex items-center justify-between gap-3">
    {#if project?.notionConnectionId}
      <Button variant="bare" label="Unlink" disabled={working} onclick={() => void unlink()} />
    {:else}
      <span></span>
    {/if}
    <Button
      label={working ? "Syncing…" : !project ? "Create project" : project.notionConnectionId ? "Save and sync" : "Link and sync"}
      disabled={!database || working}
      onclick={() => void save()}
    />
  </div>
</Dialog>
