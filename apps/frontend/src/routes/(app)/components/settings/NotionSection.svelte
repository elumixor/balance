<script lang="ts">
  import { Button } from "$lib/components";
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { disconnectNotion } from "$lib/projects/queries";
  import { NotebookPen } from "lucide-svelte";
  import NotionSetup from "./NotionSetup.svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * One row: whether a workspace is mirrored and when it last was. Connecting is Notion's own
   * consent screen — the pages this app may read are the ones ticked there — and everything else
   * is one setup dialog, because choosing a database, a sphere and what its columns mean is one
   * decision rather than three settings.
   */
  const status = $derived(store.notion.value ?? null);

  let working = $state(false);
  let setup = $state(false);

  void store.notion.ensure();

  async function connect() {
    working = true;
    try {
      await projectsData.connectNotion();
      setup = true;
    } catch (error) {
      if (!(error instanceof ConnectCancelled))
        diagnostics.report("Notion", error, { title: "Couldn't connect Notion" });
    } finally {
      working = false;
    }
  }

  async function disconnect() {
    working = true;
    try {
      store.notion.set(await disconnectNotion());
    } catch (error) {
      diagnostics.report("Notion", error, { title: "Couldn't disconnect Notion" });
    } finally {
      working = false;
    }
  }

  const note = $derived.by(() => {
    if (!status?.connected) return "Mirror the projects and tasks you already keep there.";
    if (status.needsReconnect) return "The connection expired — connect it again.";
    if (!status.dataSourceId) return "Connected. Choose which database holds your projects.";
    return when(status.lastSyncedAt);
  });

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
  <SettingRow icon={NotebookPen} label={status?.connected ? status.workspaceName || "Notion" : "Notion"} {note}>
    {#if status?.connected && !status.needsReconnect}
      <div class="flex gap-2">
        <Button
          label={status.dataSourceId ? "Configure" : "Choose database"}
          variant={status.dataSourceId ? "outline" : "solid"}
          size="sm"
          onclick={() => (setup = true)}
        />
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

  {#if status?.lastError}
    <p class="t-micro px-1 text-fg-faint">{status.lastError}</p>
  {/if}
</SettingsGroup>

<NotionSetup open={setup} onclose={() => (setup = false)} />
