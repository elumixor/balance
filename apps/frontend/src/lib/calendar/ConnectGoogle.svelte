<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import { invalidate, store } from "$lib/store.svelte";
  import { calendarData } from "./calendar-data.svelte";
  import { connectGoogle } from "./connect";

  /**
   * The calendar is the app's source of truth, so with nothing connected there is nothing to
   * draw — this is what stands in for the week until there is.
   */
  const data = calendarData;

  /** The stats screen learns the grant expired from its own response, not the calendar's. */
  let { needsReconnect }: { needsReconnect?: boolean } = $props();
  const expired = $derived(needsReconnect ?? data.needsReconnect);

  let connecting = $state(false);
  let error = $state<string | null>(null);

  async function connect() {
    connecting = true;
    error = null;
    try {
      await connectGoogle();
      invalidate.integrations();
      await Promise.all([store.calendars.refresh(), data.refreshWeeks()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't start the connection.";
    } finally {
      connecting = false;
    }
  }
</script>

<div class="space-y-3">
  <p class="t-label text-fg-muted">
    {expired
      ? "The connection expired. Reconnecting brings back every event and everything you'd mapped."
      : "Your week lives in Google Calendar. Balance reads it, and adds to it — nothing else."}
  </p>
  {#if error}<InlineError message={error} />{/if}
  <Button
    label={expired ? "Reconnect" : "Connect Google Calendar"}
    size="sm"
    full
    loading={connecting}
    onclick={() => void connect()}
  />
</div>
