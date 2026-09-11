<script lang="ts">
  import { ComboField, NotionMark, Popover, Spinner } from "$lib/components";
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { searchNotion } from "$lib/projects/queries";
  import type { NotionTarget, Project } from "$lib/projects/types";
  import { ExternalLink, Link2, Link2Off } from "lucide-svelte";
  import PropertyRow from "./PropertyRow.svelte";

  /**
   * What this project is in Notion. A project made here can be pointed at the page it is actually
   * written on — its tasks are pulled from the task database under that page, the same way a
   * project that arrived from Notion gets its own. Unlinking keeps the tasks: they are this app's
   * records once they are here.
   *
   * The row is here whether or not a workspace is connected. Pressing it with no grant asks for
   * one and then opens the search anyway, because "connect an account first" is a errand nobody
   * came here to run.
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

  // The list follows what is typed: Notion's own search, asked once the typing pauses, and only
  // once there is a grant to ask with.
  $effect(() => {
    if (!status?.connected || status.needsReconnect) return;
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

  /** The whole of connecting, when it is needed, and then the thing that was actually pressed. */
  async function begin(open: () => void) {
    if (status?.connected && !status.needsReconnect) {
      open();
      return;
    }
    working = true;
    try {
      if (await data.ensureNotion()) open();
    } catch (error) {
      if (!(error instanceof ConnectCancelled)) diagnostics.report("Notion", error, { title: "Couldn't connect Notion" });
    } finally {
      working = false;
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

<PropertyRow label="Notion">
  {#snippet icon()}
    <span class="flex size-6 items-center justify-center"><NotionMark size={13} /></span>
  {/snippet}

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
          <button type="button" onclick={() => void begin(open)} class="bare-button t-micro px-1.5 py-1">
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
</PropertyRow>
