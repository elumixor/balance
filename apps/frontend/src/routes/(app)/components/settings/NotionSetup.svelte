<script lang="ts">
  import { Button, Dialog, Dot, Field, Select, Spinner } from "$lib/components";
  import { categories } from "$lib/core/synced.svelte";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { configureNotion, listNotionDatabases } from "$lib/projects/queries";
  import type { NotionDatabase } from "$lib/projects/types";
  import { Check } from "lucide-svelte";

  /**
   * Setting up the mirror, in the order the questions actually arise: which of the workspace's
   * databases holds the projects, which sphere their hours come out of, and what the columns
   * beside their names are. The answers are kept, so opening this again is changing them rather
   * than starting over.
   */
  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const status = $derived(store.notion.value ?? null);
  const spheres = $derived(categories.all.filter((category) => !category.isBuffer));

  let databases = $state<NotionDatabase[] | null>(null);
  let search = $state("");
  let dataSourceId = $state("");
  let categoryId = $state("");
  let description = $state<string | null>(null);
  let fields = $state<string[]>([]);
  let importing = $state(false);
  let imported = $state<string | null>(null);

  // Opening reads the workspace and starts from whatever was answered last time.
  $effect(() => {
    if (!open) return;
    dataSourceId = status?.dataSourceId ?? "";
    categoryId = status?.categoryId || (spheres[0]?.id ?? "");
    description = status?.mapping.description ?? null;
    fields = [...(status?.mapping.fields ?? [])];
    imported = null;
    if (databases === null) void load();
  });

  async function load() {
    try {
      databases = await listNotionDatabases();
    } catch (error) {
      databases = [];
      diagnostics.report("Notion", error, { title: "Couldn't read your Notion workspace" });
    }
  }

  const shown = $derived(
    (databases ?? []).filter((database) => database.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const chosen = $derived(databases?.find((database) => database.id === dataSourceId) ?? null);
  /** Only the columns that could hold a sentence — a date can't be a description. */
  const textual = $derived(
    (chosen?.properties ?? []).filter((property) => property.type === "rich_text" || property.type === "text"),
  );
  const drawable = $derived((chosen?.properties ?? []).filter((property) => property.type !== "title"));
  const ready = $derived(Boolean(dataSourceId && categoryId));

  function toggleField(name: string) {
    fields = fields.includes(name) ? fields.filter((one) => one !== name) : [...fields, name];
  }

  async function run() {
    importing = true;
    try {
      store.notion.set(await configureNotion({ dataSourceId, categoryId, mapping: { description, fields } }));
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

<Dialog title="Import from Notion" {open} {onclose}>
  <div class="space-y-6">
    <section class="space-y-2">
      <h3 class="t-label text-fg">Which database holds your projects</h3>
      {#if databases === null}
        <div class="flex items-center gap-2 py-2 text-fg-faint"><Spinner size={14} /><span class="t-micro">Reading your workspace…</span></div>
      {:else if databases.length === 0}
        <p class="t-micro text-fg-faint">
          This connection can’t see any databases yet. In Notion, give it access to the page your
          projects live on, then reopen this.
        </p>
      {:else}
        {#if databases.length > 6}
          <Field bind:value={search} placeholder="Search databases" ariaLabel="Search databases" />
        {/if}
        <ul class="max-h-52 overflow-y-auto rounded-lg border border-line">
          {#each shown as database (database.id)}
            <li>
              <button
                type="button"
                onclick={() => (dataSourceId = database.id)}
                class="hoverable flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <span class="t-label min-w-0 flex-1 truncate text-fg">{database.name}</span>
                <span class="t-micro shrink-0 text-fg-faint">{database.properties.length} columns</span>
                {#if database.id === dataSourceId}<Check size={14} class="shrink-0 text-positive" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="space-y-2">
      <h3 class="t-label text-fg">Whose hours these are</h3>
      <div class="flex flex-wrap gap-1.5">
        {#each spheres as sphere (sphere.id)}
          <button
            type="button"
            onclick={() => (categoryId = sphere.id)}
            class="press t-micro flex items-center gap-1.5 rounded-full border px-2 py-1
              {sphere.id === categoryId ? 'border-ink text-fg' : 'border-line text-fg-muted'}"
          >
            <Dot color={sphere.color} size={7} />
            {sphere.name || "Unnamed"}
          </button>
        {/each}
      </div>
    </section>

    {#if chosen}
      <section class="space-y-3">
        <h3 class="t-label text-fg">What its columns mean</h3>
        <div class="flex items-center justify-between gap-3">
          <span class="t-micro text-fg-muted">The line under a project’s name</span>
          <Select
            label="Description column"
            width={200}
            value={description ?? ""}
            options={[{ value: "", label: "None" }, ...textual.map((one) => ({ value: one.name, label: one.name }))]}
            onchange={(value) => (description = value || null)}
          />
        </div>
        <div class="space-y-1.5">
          <span class="t-micro text-fg-muted">Shown beside the name</span>
          <div class="flex flex-wrap gap-1.5">
            {#each drawable as property (property.name)}
              {@const on = fields.length === 0 || fields.includes(property.name)}
              <button
                type="button"
                onclick={() => toggleField(property.name)}
                class="press t-micro rounded-full border px-2 py-0.5
                  {on ? 'border-ink text-fg' : 'border-line text-fg-faint'}"
              >
                {property.name}
              </button>
            {/each}
          </div>
          <p class="t-micro text-fg-faint">Nothing ticked draws every column that says something.</p>
        </div>
      </section>
    {/if}

    <div class="flex items-center justify-between gap-3">
      <p class="t-micro text-fg-faint">{imported ?? "Tasks come from the task database under each project’s page."}</p>
      <Button
        label={importing ? "Importing…" : status?.dataSourceId ? "Save and sync" : "Import projects"}
        disabled={!ready || importing}
        onclick={() => void run()}
      />
    </div>
  </div>
</Dialog>
