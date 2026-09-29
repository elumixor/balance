<script lang="ts">
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { listNotionDatabases } from "$lib/projects/queries";
  import type { NotionDatabase } from "$lib/projects/types";
  import { Building2, Database, Plus } from "lucide-svelte";
  import LabeledField from "./LabeledField.svelte";
  import Select from "./Select.svelte";
  import Spinner from "./Spinner.svelte";

  /**
   * Which Notion database, asked as two dropdowns that follow each other: the workspace — every
   * one this account has granted, and a last row that grants another on Notion's own consent
   * screen, where the Notion login and the workspace are picked — then the databases that
   * workspace shared. The database's columns come with it, so whoever asked can go straight on.
   */
  let {
    connectionId,
    databaseId,
    onconnection,
    ondatabase,
  }: {
    connectionId: string | null;
    databaseId: string | null;
    onconnection: (id: string) => void;
    ondatabase: (database: NotionDatabase | null) => void;
  } = $props();

  let databases = $state<NotionDatabase[] | null>(null);
  let connecting = $state(false);

  const workspaces = $derived(
    projectsData.connections.map((connection) => ({
      value: connection.id,
      label: `${connection.workspaceIcon && !connection.workspaceIcon.startsWith("http") ? `${connection.workspaceIcon} ` : ""}${connection.workspaceName || "Workspace"}${connection.needsReconnect ? " — reconnect" : ""}`,
    })),
  );

  // A workspace chosen reads its databases; the one asked for is handed back with its columns.
  $effect(() => {
    const id = connectionId;
    databases = null;
    if (!id) return;
    listNotionDatabases(id)
      .then((found) => {
        if (id !== connectionId) return;
        databases = found;
        ondatabase(found.find((one) => one.id === databaseId) ?? null);
      })
      .catch((error: unknown) => {
        databases = [];
        diagnostics.report("Notion", error, { title: "Couldn't read that Notion workspace" });
      });
  });

  async function connect() {
    connecting = true;
    try {
      const landed = await projectsData.connectNotion();
      if (landed) onconnection(landed.id);
    } catch (error) {
      if (!(error instanceof ConnectCancelled)) diagnostics.report("Notion", error, { title: "Couldn't connect Notion" });
    } finally {
      connecting = false;
    }
  }

  function pickWorkspace(id: string) {
    const chosen = projectsData.connections.find((one) => one.id === id);
    if (chosen?.needsReconnect) void connect();
    else onconnection(id);
  }
</script>

<LabeledField icon={Building2} label="Workspace">
  <Select
    full
    label="Workspace"
    placeholder={connecting ? "Waiting for Notion…" : "Connect a workspace…"}
    value={connectionId ?? ""}
    options={workspaces}
    onchange={pickWorkspace}
  >
    {#snippet actions(close)}
      <button
        type="button"
        onclick={() => {
          close();
          void connect();
        }}
        class="t-label flex w-full items-center gap-2 px-3 py-2.5 text-left text-fg-muted hover:bg-surface-alt"
      >
        {#if connecting}<Spinner size={13} />{:else}<Plus size={15} />{/if}
        {workspaces.length === 0 ? "Connect Notion…" : "Connect another workspace…"}
      </button>
    {/snippet}
  </Select>
</LabeledField>

{#if connectionId}
  <LabeledField icon={Database} label="Database" loading={databases === null}>
    {#if databases?.length === 0}
      <p class="t-micro text-fg-faint">
        This workspace hasn’t shared any databases with Balance. Connect it again and tick the pages
        your work lives on.
      </p>
    {:else}
      <Select
        full
        label="Database"
        placeholder="Choose a database…"
        value={databaseId ?? ""}
        options={(databases ?? []).map((one) => ({ value: one.id, label: one.name }))}
        onchange={(id) => ondatabase(databases?.find((one) => one.id === id) ?? null)}
      />
    {/if}
  </LabeledField>
{/if}
