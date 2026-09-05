<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button, EmptyState } from "$lib/components";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { settings } from "$lib/settings";
  import { Sunrise } from "lucide-svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * What the app is waiting on you for. A notification waved away is not gone — it lands here,
   * and the avatar wears a dot until it is done. One kind of item today: the sitting.
   */
  const stars = $derived(sessionNudge.stars);

  function openSession() {
    settings.hide();
    void goto("/session");
  }
</script>

<SettingsGroup title="Inbox" note="Things waiting for you." divided={false}>
  {#if sessionNudge.owed}
    <div class="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-fg">
        <Sunrise size={16} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="t-label text-fg">Plan {sessionNudge.subject}</p>
        <p class="t-micro text-fg-muted">{stars > 0 ? `+${stars} ★ for two minutes` : "Two minutes"}</p>
      </div>
      <Button label="Open" size="sm" onclick={openSession} />
    </div>
  {:else}
    <EmptyState title="Nothing waiting." hint="The next sitting will show up here when it's due." />
  {/if}
</SettingsGroup>
