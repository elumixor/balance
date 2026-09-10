<script lang="ts">
  import { Button } from "$lib/components";
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { chooseNotionDatabase, disconnectNotion, listNotionDatabases } from "$lib/projects/queries";
  import { NotebookPen } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * The workspace the projects are mirrored from. Connecting is Notion's own consent screen, so
   * the pages this app may read are the pages somebody ticked there — nothing is pasted here, and
   * no database has to be shared by hand. One question is left afterwards: which of the databases
   * the grant can see holds the projects.
   */
  const status = $derived(store.notion.value ?? null);

  let databases = $state<{ id: string; name: string }[] | null>(null);
  let working = $state(false);

  void store.notion.ensure();

  // The list is only worth a request once there is a grant to list with, and only until a
  // database has been chosen — after that the row says which one and offers to change it.
  $effect(() => {
    if (status?.connected && !status.needsReconnect && databases === null) void load();
  });

  async function load() {
    try {
      databases = await listNotionDatabases();
    } catch (error) {
      databases = [];
      diagnostics.report("Settings", error, { title: "Couldn't list your Notion databases" });
    }
  }

  async function connect() {
    working = true;
    try {
      await projectsData.connectNotion();
      databases = null;
    } catch (error) {
      if (!(error instanceof ConnectCancelled)) diagnostics.report("Settings", error, { title: "Couldn't connect Notion" });
    } finally {
      working = false;
    }
  }

  async function choose(dataSourceId: string) {
    working = true;
    try {
      store.notion.set(await chooseNotionDatabase(dataSourceId));
      await projectsData.mirror(true);
    } catch (error) {
      diagnostics.report("Settings", error, { title: "Couldn't read that database" });
    } finally {
      working = false;
    }
  }

  async function disconnect() {
    working = true;
    try {
      store.notion.set(await disconnectNotion());
      databases = null;
    } catch (error) {
      diagnostics.report("Settings", error, { title: "Couldn't disconnect Notion" });
    } finally {
      working = false;
    }
  }

  const chosen = $derived(databases?.find((one) => one.id === status?.dataSourceId) ?? null);

  function when(at: string | null) {
    if (!at) return "Not synced yet.";
    const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
    if (minutes < 1) return "Synced just now.";
    if (minutes < 60) return `Synced ${minutes} min ago.`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `Synced ${hours}h ago.` : `Synced ${Math.round(hours / 24)}d ago.`;
  }
</script>

<SettingsGroup title="Notion">
  <SettingRow
    icon={NotebookPen}
    label={status?.connected ? status.workspaceName || "Notion" : "Notion"}
    note={!status?.connected
      ? "Mirror the projects and tasks you already keep there."
      : status.needsReconnect
        ? "The connection expired — connect it again."
        : status.dataSourceId
          ? when(status.lastSyncedAt)
          : "Connected. Choose the database your projects live in."}
  >
    {#if status?.connected && !status.needsReconnect}
      <div class="flex gap-2">
        {#if status.dataSourceId}
          <Button label="Sync now" variant="outline" size="sm" onclick={() => void projectsData.mirror(true)} />
        {/if}
        <Button label="Disconnect" variant="outline" size="sm" disabled={working} onclick={() => void disconnect()} />
      </div>
    {:else}
      <Button
        label={working ? "Waiting…" : status?.needsReconnect ? "Reconnect" : "Connect"}
        size="sm"
        disabled={working}
        onclick={() => void connect()}
      />
    {/if}
  </SettingRow>

  {#if status?.connected && !status.needsReconnect}
    {#if databases === null}
      <p class="t-micro px-1 text-fg-faint">Reading what this connection can see…</p>
    {:else if databases.length === 0}
      <p class="t-micro px-1 text-fg-faint">
        This connection can’t see any databases yet — tick the pages it may read in Notion, then reconnect.
      </p>
    {:else}
      <div class="flex flex-wrap gap-1.5 px-1">
        {#each databases as database (database.id)}
          {@const on = database.id === status.dataSourceId}
          <button
            type="button"
            disabled={working}
            onclick={() => void choose(database.id)}
            class="press t-micro rounded-full border px-2 py-0.5 {on ? 'border-ink text-fg' : 'border-line text-fg-muted'}"
          >
            {database.name}
          </button>
        {/each}
      </div>
    {/if}
    {#if chosen}
      <p class="t-micro px-1 text-fg-faint">
        Projects are read from “{chosen.name}”. Their tasks come from the task database under each
        project’s page; status, dates and who a task is for are written back.
      </p>
    {/if}
  {/if}

  {#if status?.lastError}
    <p class="t-micro px-1 text-fg-faint">{status.lastError}</p>
  {/if}
</SettingsGroup>
