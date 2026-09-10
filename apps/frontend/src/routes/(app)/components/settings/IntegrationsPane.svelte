<script lang="ts">
  import { Button, Tooltip } from "$lib/components";
  import { feedKey, INTEGRATIONS, integrations } from "$lib/integrations/integrations.svelte";
  import type { Integration } from "$lib/integrations/types";
  import { preferences } from "$lib/account/preferences.svelte";
  import { invalidate } from "$lib/core/store.svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import NotionSection from "./NotionSection.svelte";

  /**
   * What knows how some hours actually went — Apple Health today. One row per integration: its
   * glyph, its name, one line on what it brings, and a Connect button, which is the permission
   * sheet. Linking a feed to an event is done from the event's own card, not here; this page is
   * only where the device is let read the source, and where a sync can be forced.
   *
   * Reading is this device's: on a machine that can't read one, the button is inert and says on
   * hover which app can — unless the phone has already read it for this account, in which case
   * the row says when, and Refresh fetches what the phone wrote.
   */
  const connected = (integration: Integration) => integrations.connected(integration.id);
  /** The newest read of any of the integration's feeds, by whichever device could. */
  const readElsewhere = (integration: Integration) =>
    integration.feeds
      .map((feed) => preferences.feedSyncedAt(feedKey(integration.id, feed.id))?.getTime() ?? null)
      .reduce<number | null>((latest, at) => (at !== null && (latest === null || at > latest) ? at : latest), null);

  async function connect(integration: Integration) {
    if (!(await integrations.connect(integration))) return;
    for (const feed of integration.feeds) void integrations.sync(integration, feed);
  }

  function when(at: number | null) {
    if (at === null) return "Not synced yet.";
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return "Synced just now.";
    if (minutes < 60) return `Synced ${minutes} min ago.`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `Synced ${hours}h ago.` : `Synced ${Math.round(hours / 24)}d ago.`;
  }
</script>

<SettingsGroup title="Integrations">
  <div class="space-y-1">
    {#each INTEGRATIONS as integration (integration.id)}
      {@const on = connected(integration)}
      {@const elsewhere = readElsewhere(integration)}
      <SettingRow icon={integration.icon} label={integration.name} note={integration.note}>
        {#if !integration.available}
          {#if elsewhere !== null}
            <Button label="Refresh" variant="outline" size="sm" onclick={() => void invalidate.calendarNow()} />
          {:else}
            <Tooltip label={integration.unavailableNote}>
              <Button label="Connect" variant="outline" size="sm" disabled onclick={() => undefined} />
            </Tooltip>
          {/if}
        {:else if on}
          <Button label="Disconnect" variant="outline" size="sm" onclick={() => integrations.disconnect(integration)} />
        {:else}
          <Button label="Connect" size="sm" onclick={() => void connect(integration)} />
        {/if}
      </SettingRow>

      {#if !integration.available && elsewhere !== null}
        <SettingRow label="Read on your iPhone" note={when(elsewhere)} />
      {/if}
      {#if integration.available && on}
        {#each integration.feeds as feed (feed.id)}
          {@const status = integrations.status(integration.id, feed.id)}
          <SettingRow label={feed.label} note={status.error ?? when(status.syncedAt)}>
            <Button
              label="Sync now"
              variant="outline"
              size="sm"
              loading={status.syncing}
              onclick={() => void integrations.sync(integration, feed)}
            />
          </SettingRow>
        {/each}
      {/if}
    {/each}
  </div>
</SettingsGroup>

<NotionSection />
