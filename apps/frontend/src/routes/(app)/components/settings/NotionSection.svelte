<script lang="ts">
  import { Button, NotionMark, NotionSetup } from "$lib/components";
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { store } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import type { NotionConnection } from "$lib/projects/types";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * One row per Notion workspace this account has granted, saying whose login granted it and when
   * it last synced, and one more to grant another. Granting is Notion's own consent screen — the
   * workspace and the pages this app may read are chosen there — and importing a database of
   * projects is one dialog, because choosing a database, a sphere and a column is one decision.
   */
  let working = $state(false);
  let setup = $state(false);

  void store.notion.ensure();

  async function run(action: () => Promise<unknown>, title: string) {
    working = true;
    try {
      await action();
    } catch (error) {
      if (!(error instanceof ConnectCancelled)) diagnostics.report("Notion", error, { title });
    } finally {
      working = false;
    }
  }

  function note(connection: NotionConnection) {
    const who = connection.accountEmail || connection.accountName;
    const state = connection.needsReconnect ? "The connection expired." : (connection.lastError ?? when(connection.lastSyncedAt));
    return who ? `${who} · ${state}` : state;
  }

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
  {#each projectsData.connections as connection (connection.id)}
    <SettingRow icon={NotionMark} label={connection.workspaceName || "Notion"} note={note(connection)}>
      <div class="flex gap-2">
        {#if connection.needsReconnect}
          <Button
            label="Reconnect"
            size="sm"
            disabled={working}
            onclick={() => void run(() => projectsData.connectNotion(), "Couldn't connect Notion")}
          />
        {/if}
        <Button
          label="Disconnect"
          variant="outline"
          size="sm"
          disabled={working}
          onclick={() => void run(() => projectsData.disconnectNotion(connection.id), "Couldn't disconnect Notion")}
        />
      </div>
    </SettingRow>
  {/each}

  <SettingRow
    icon={NotionMark}
    label={projectsData.connections.length === 0 ? "Notion" : "Another workspace"}
    note={projectsData.connections.length === 0 ? "Link projects to the task boards you already keep there." : undefined}
  >
    <div class="flex gap-2">
      <Button
        label={working ? "Waiting…" : projectsData.connections.length === 0 ? "Connect" : "Add"}
        variant="outline"
        size="sm"
        disabled={working}
        onclick={() => void run(() => projectsData.connectNotion(), "Couldn't connect Notion")}
      />
      {#if projectsData.usableConnections.length > 0}
        <Button label="Import projects" variant="outline" size="sm" onclick={() => (setup = true)} />
      {/if}
    </div>
  </SettingRow>
</SettingsGroup>

<NotionSetup open={setup} onclose={() => (setup = false)} />
