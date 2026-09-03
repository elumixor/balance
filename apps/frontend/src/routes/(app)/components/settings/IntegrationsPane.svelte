<script lang="ts">
  import { Button, Tooltip } from "$lib/components";
  import { INTEGRATIONS, type Integration, integrations } from "$lib/integrations/integrations.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * What knows how some hours actually went — Apple Health today. One row per integration: its
   * glyph, its name, one line on what it brings, and a Connect button, which is the permission
   * sheet. Linking a feed to an event is done from the event's own card, not here; this page is
   * only where the device is let read the source, and where a sync can be forced.
   *
   * Everything here is this device's: on a machine that can't read one, the button is inert and
   * says on hover which app can.
   */
  const connected = (integration: Integration) => integrations.connected(integration.id);

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

<SettingsGroup
  title="Integrations"
  divided={false}
>
  <ul class="divide-y divide-line">
    {#each INTEGRATIONS as integration (integration.id)}
      {@const on = connected(integration)}
      <li class="space-y-3 py-4 first:pt-0 last:pb-0">
        <div class="flex items-center gap-3">
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-alt text-fg-muted"
          >
            <integration.icon size={18} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="t-body text-fg">{integration.name}</p>
            <p class="t-micro text-fg-faint">{integration.note}</p>
          </div>
          {#if !integration.available}
            <Tooltip label={integration.unavailableNote}>
              <Button label="Connect" variant="outline" size="sm" disabled onclick={() => undefined} />
            </Tooltip>
          {:else if on}
            <Button label="Disconnect" variant="outline" size="sm" onclick={() => integrations.disconnect(integration)} />
          {:else}
            <Button label="Connect" size="sm" onclick={() => void connect(integration)} />
          {/if}
        </div>

        {#if integration.available && on}
          {#each integration.feeds as feed (feed.id)}
            {@const status = integrations.status(integration.id, feed.id)}
            <div class="flex items-center justify-between gap-3 pl-12">
              <p class="t-micro min-w-0 text-fg-faint">
                {feed.label} · {status.error ?? when(status.syncedAt)}
              </p>
              <Button
                label="Sync now"
                variant="outline"
                size="sm"
                loading={status.syncing}
                onclick={() => void integrations.sync(integration, feed)}
              />
            </div>
          {/each}
        {/if}
      </li>
    {/each}
  </ul>
</SettingsGroup>
