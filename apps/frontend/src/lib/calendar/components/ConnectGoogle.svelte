<script lang="ts">
  import { BrowserWait, Button } from "$lib/components";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { invalidate, store } from "$lib/core/store.svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { ConnectCancelled, connectGoogle } from "$lib/calendar/connect";

  /**
   * The calendar is the app's source of truth, so with nothing connected there is nothing to
   * draw — this is what stands in for the week until there is.
   */
  const data = calendarData;

  /** The stats screen learns the grant expired from its own response, not the calendar's. */
  let { needsReconnect }: { needsReconnect?: boolean } = $props();
  const expired = $derived(needsReconnect ?? data.needsReconnect);

  let connecting = $state(false);
  let controller: AbortController | null = null;

  async function connect() {
    connecting = true;
    controller = new AbortController();
    try {
      await connectGoogle(controller.signal);
      invalidate.integrations();
      await Promise.all([store.calendars.refresh(), data.refreshWeeks()]);
    } catch (e) {
      if (!(e instanceof ConnectCancelled)) diagnostics.report("Google Calendar", e, { title: "Couldn’t connect Google Calendar" });
    } finally {
      connecting = false;
      controller = null;
    }
  }

  function cancel() {
    controller?.abort();
  }
</script>

<div class="space-y-3">
  <p class="t-label text-fg-muted">
    {expired
      ? "The connection expired. Reconnecting brings back every event and everything you'd mapped."
      : "Your week lives in Google Calendar. Balance reads it, and adds to it — nothing else."}
  </p>
  {#if connecting}
    <BrowserWait message="Waiting for you to finish in the browser…" oncancel={cancel} />
  {:else}
    <Button
      label={expired ? "Reconnect" : "Connect Google Calendar"}
      size="sm"
      full
      onclick={() => void connect()}
    >
      {#snippet icon()}
        <span
          class="block size-4 shrink-0"
          style="background-color: currentColor; -webkit-mask: url('/icons/google.png') center / contain no-repeat; mask: url('/icons/google.png') center / contain no-repeat;"
          aria-hidden="true"
        ></span>
      {/snippet}
    </Button>
  {/if}
</div>
