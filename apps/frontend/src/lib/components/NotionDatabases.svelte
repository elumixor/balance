<script lang="ts">
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { listNotionDatabases } from "$lib/projects/queries";
  import type { NotionDatabase } from "$lib/projects/types";
  import { Database } from "lucide-svelte";
  import Field from "./Field.svelte";
  import Skeleton from "./Skeleton.svelte";

  /**
   * The databases one workspace's grant can see, to pick one from. Read again whenever the
   * workspace changes; the answer carries each database's columns, so whoever asked can go on to
   * say what they mean without another request.
   */
  let {
    connectionId,
    selected,
    onselect,
  }: { connectionId: string; selected: string | null; onselect: (database: NotionDatabase) => void } = $props();

  /** Past this many a list is scrolled for rather than read, and a search earns its row. */
  const SEARCHABLE = 6;

  let databases = $state<NotionDatabase[] | null>(null);
  let search = $state("");

  $effect(() => {
    const id = connectionId;
    databases = null;
    search = "";
    listNotionDatabases(id)
      .then((found) => {
        if (id !== connectionId) return;
        databases = found;
        const current = found.find((database) => database.id === selected);
        if (current) onselect(current);
      })
      .catch((error: unknown) => {
        databases = [];
        diagnostics.report("Notion", error, { title: "Couldn't read that Notion workspace" });
      });
  });

  const shown = $derived(
    (databases ?? []).filter((database) => database.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
</script>

{#if databases === null}
  <div class="space-y-1">
    {#each [0, 1, 2] as row (row)}
      <Skeleton height={32} radius={6} />
    {/each}
  </div>
{:else if databases.length === 0}
  <p class="t-micro px-2 text-fg-faint">
    This workspace hasn’t shared any databases with Balance. Reconnect it and tick the pages your
    work lives on.
  </p>
{:else}
  <div class="space-y-1.5">
    {#if databases.length > SEARCHABLE}
      <Field bind:value={search} placeholder="Search databases" ariaLabel="Search databases" />
    {/if}
    <div class="max-h-56 space-y-0.5 overflow-y-auto" role="radiogroup" aria-label="Databases">
      {#each shown as database (database.id)}
        <button
          type="button"
          role="radio"
          aria-checked={database.id === selected}
          onclick={() => onselect(database)}
          class="menu-row {database.id === selected ? 'bg-surface-alt' : ''}"
        >
          <Database size={14} class="shrink-0 text-fg-faint" />
          <span class="min-w-0 flex-1 truncate">{database.name}</span>
          {#if database.id === selected}
            <span class="size-1.5 shrink-0 rounded-full bg-ink"></span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}
