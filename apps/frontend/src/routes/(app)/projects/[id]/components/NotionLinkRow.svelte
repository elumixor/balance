<script lang="ts">
  import { ComboField, Popover, Spinner } from "$lib/components";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { searchNotion } from "$lib/projects/queries";
  import type { NotionTarget, Project } from "$lib/projects/types";
  import { ExternalLink, Link2, Link2Off } from "lucide-svelte";

  /**
   * What this project is in Notion. A project made here can be pointed at the page it is actually
   * written on — its tasks are pulled from the task database under that page, the same way a
   * project that arrived from Notion gets its own. Unlinking keeps the tasks: they are this app's
   * records once they are here.
   */
  let { project }: { project: Project } = $props();

  const status = $derived(store.notion.value ?? null);
  const linked = $derived(Boolean(project.notionUrl));

  /** Long enough that a name is typed rather than spelled out one request per letter. */
  const TYPING_MS = 250;

  let query = $state("");
  let results = $state<NotionTarget[]>([]);
  let searching = $state(false);
  let working = $state(false);

  // The list follows what is typed: Notion's own search, asked once the typing pauses.
  $effect(() => {
    const text = query;
    searching = true;
    const timer = setTimeout(() => void find(text), TYPING_MS);
    return () => clearTimeout(timer);
  });

  async function find(text: string) {
    try {
      results = await searchNotion(text);
    } catch (error) {
      results = [];
      diagnostics.report("Notion", error, { title: "Couldn't search your Notion workspace" });
    } finally {
      searching = false;
    }
  }

  async function pick(target: NotionTarget, close: () => void) {
    close();
    working = true;
    try {
      await data.link(project.id, { id: target.id, kind: target.kind });
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't link that page" });
    } finally {
      working = false;
    }
  }

  async function unlink() {
    working = true;
    try {
      await data.unlink(project.id);
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't unlink this project" });
    } finally {
      working = false;
    }
  }
</script>

{#if status?.connected && !status.needsReconnect}
  <div class="flex items-center justify-between gap-2 px-1">
    <span class="t-micro text-fg-muted">Notion</span>

    {#if working}
      <span class="flex items-center gap-1.5 px-2 text-fg-faint"><Spinner size={12} /><span class="t-micro">Reading…</span></span>
    {:else if linked}
      <span class="flex items-center gap-1">
        <a
          href={project.notionUrl}
          target="_blank"
          rel="noreferrer"
          class="t-micro flex items-center gap-1.5 px-1 text-fg underline-offset-2 hover:underline"
        >
          <ExternalLink size={11} />
          Linked
        </a>
        <button type="button" onclick={() => void unlink()} aria-label="Unlink from Notion" class="bare-button size-6">
          <Link2Off size={12} />
        </button>
      </span>
    {:else}
      <Popover width={280} align="end">
        {#snippet trigger(open)}
          <button type="button" onclick={open} class="bare-button t-micro px-1.5 py-1">
            <Link2 size={12} />
            Link to Notion
          </button>
        {/snippet}
        {#snippet content(close)}
          <div class="space-y-1 p-1">
            <ComboField
              bind:value={query}
              options={results.map((result) => ({
                key: result.id,
                label: result.name,
                hint: result.kind === "database" ? "database" : "page",
                value: result,
              }))}
              placeholder="Search Notion"
              ariaLabel="Search Notion"
              autofocus
              width="anchor"
              onpick={(option) => void pick(option.value, close)}
            />
            {#if searching}
              <p class="t-micro px-2 py-1 text-fg-faint">Searching…</p>
            {:else if query && results.length === 0}
              <p class="t-micro px-2 py-1 text-fg-faint">Nothing by that name this connection can see.</p>
            {/if}
          </div>
        {/snippet}
      </Popover>
    {/if}
  </div>
{/if}
