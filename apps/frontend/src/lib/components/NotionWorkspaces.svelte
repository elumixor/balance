<script lang="ts">
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import type { NotionConnection } from "$lib/projects/types";
  import { Plus, RotateCw } from "lucide-svelte";
  import NotionMark from "./NotionMark.svelte";
  import Spinner from "./Spinner.svelte";

  /**
   * Every Notion workspace this account has granted, under the Notion login that granted it, and
   * one more row to grant another. Which login and which workspace is Notion's own consent
   * screen's question, so adding one is always the same press; a workspace whose grant expired
   * asks for the same screen again from its own row.
   */
  let { selected, onselect }: { selected: string | null; onselect: (connection: NotionConnection) => void } =
    $props();

  let connecting = $state(false);

  const accounts = $derived.by(() => {
    const byAccount = new Map<string, NotionConnection[]>();
    for (const connection of projectsData.connections) {
      const key = connection.accountEmail || connection.accountName;
      byAccount.set(key, [...(byAccount.get(key) ?? []), connection]);
    }
    return [...byAccount.entries()].map(([account, workspaces]) => ({ account, workspaces }));
  });

  async function connect() {
    connecting = true;
    try {
      const landed = await projectsData.connectNotion();
      if (landed) onselect(landed);
    } catch (error) {
      if (!(error instanceof ConnectCancelled)) diagnostics.report("Notion", error, { title: "Couldn't connect Notion" });
    } finally {
      connecting = false;
    }
  }
</script>

<div class="space-y-3">
  {#each accounts as { account, workspaces } (account)}
    <div class="space-y-0.5">
      <p class="t-micro px-2 text-fg-faint">{account || "Notion account"}</p>
      {#each workspaces as connection (connection.id)}
        <button
          type="button"
          role="radio"
          aria-checked={connection.id === selected}
          onclick={() => (connection.needsReconnect ? void connect() : onselect(connection))}
          class="menu-row {connection.id === selected ? 'bg-surface-alt' : ''}"
        >
          <span class="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm text-fg-muted">
            {#if connection.workspaceIcon?.startsWith("http")}
              <img src={connection.workspaceIcon} alt="" class="size-5 object-cover" />
            {:else if connection.workspaceIcon}
              <span class="text-sm leading-none">{connection.workspaceIcon}</span>
            {:else}
              <NotionMark size={14} />
            {/if}
          </span>
          <span class="min-w-0 flex-1 truncate">{connection.workspaceName || "Workspace"}</span>
          {#if connection.needsReconnect}
            <span class="t-micro flex items-center gap-1 text-fg-faint"><RotateCw size={11} />Reconnect</span>
          {:else if connection.id === selected}
            <span class="size-1.5 shrink-0 rounded-full bg-ink"></span>
          {/if}
        </button>
      {/each}
    </div>
  {/each}

  <button type="button" onclick={() => void connect()} disabled={connecting} class="menu-row text-fg-muted">
    <span class="flex size-5 shrink-0 items-center justify-center">
      {#if connecting}<Spinner size={12} />{:else}<Plus size={14} />{/if}
    </span>
    {connecting ? "Waiting for Notion…" : accounts.length === 0 ? "Connect Notion" : "Add a workspace"}
  </button>
</div>
