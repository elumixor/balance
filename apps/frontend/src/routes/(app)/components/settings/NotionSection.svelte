<script lang="ts">
  import { Button, Field } from "$lib/components";
  import { store } from "$lib/core/store.svelte";
  import { NotebookPen } from "lucide-svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { connectNotion, disconnectNotion } from "$lib/projects/queries";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * The workspace the projects are mirrored from. Two things are needed and both are pasted: an
   * integration token, and the database of projects it has been shared with. They are checked
   * together before either is kept, so a grant that can't open that database says so here rather
   * than failing quietly every night.
   */
  const status = $derived(store.notion.value ?? null);

  let token = $state("");
  let database = $state("");
  let working = $state(false);

  void store.notion.ensure();

  async function connect() {
    working = true;
    try {
      store.notion.set(await connectNotion({ token: token.trim(), database: database.trim() }));
      token = "";
      database = "";
      await projectsData.mirror(true);
    } catch (error) {
      diagnostics.report("Settings", error, { title: "Notion wouldn't accept that" });
    } finally {
      working = false;
    }
  }

  async function disconnect() {
    working = true;
    try {
      store.notion.set(await disconnectNotion());
    } catch (error) {
      diagnostics.report("Settings", error, { title: "Couldn't disconnect Notion" });
    } finally {
      working = false;
    }
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
  {#if status?.connected}
    <SettingRow
      icon={NotebookPen}
      label={status.workspaceName || "Notion"}
      note={status.needsReconnect ? "The token stopped working — paste a new one." : when(status.lastSyncedAt)}
    >
      <div class="flex gap-2">
        <Button label="Sync now" variant="outline" size="sm" onclick={() => void projectsData.mirror(true)} />
        <Button label="Disconnect" variant="outline" size="sm" disabled={working} onclick={() => void disconnect()} />
      </div>
    </SettingRow>
    {#if status.lastError}
      <p class="t-micro px-1 text-fg-faint">{status.lastError}</p>
    {/if}
  {/if}

  {#if !status?.connected || status.needsReconnect}
    <div class="space-y-2">
      <Field bind:value={token} placeholder="Integration token (ntn_…)" ariaLabel="Notion integration token" />
      <Field bind:value={database} placeholder="Link to your projects database" ariaLabel="Notion projects database" />
      <Button
        label={working ? "Checking…" : "Connect Notion"}
        size="sm"
        disabled={working || !token.trim() || !database.trim()}
        onclick={() => void connect()}
      />
      <p class="t-micro text-fg-faint">
        Projects, their tasks and the people on them are read from that database. Status, dates and
        who a task is for are written back; everything else is Notion’s.
      </p>
    </div>
  {/if}
</SettingsGroup>
