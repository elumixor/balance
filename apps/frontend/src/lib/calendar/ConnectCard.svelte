<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import { invalidate } from "$lib/store.svelte";
  import { connectGoogle } from "./connect";

  /**
   * The calendar is the app's source of truth, so with nothing connected there is nothing to
   * show — this is the screen until there is.
   */
  let { needsReconnect = false }: { needsReconnect?: boolean } = $props();

  let connecting = $state(false);
  let error = $state<string | null>(null);

  async function connect() {
    connecting = true;
    error = null;
    try {
      await connectGoogle();
      invalidate.integrations();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't start the connection.";
    } finally {
      connecting = false;
    }
  }
</script>

<Panel>
  <div class="flex flex-col items-start gap-3">
    <div class="space-y-1">
      <p class="t-body">
        {needsReconnect ? "Google needs you to say yes again" : "Connect your Google Calendar"}
      </p>
      <p class="t-label text-fg-muted">
        {needsReconnect
          ? "The connection expired. Reconnecting brings back every event and everything you'd mapped."
          : "Your calendar is where the week actually happens. Balance reads it, and adds to it — nothing else."}
      </p>
    </div>
    {#if error}<InlineError message={error} />{/if}
    <Button
      label={needsReconnect ? "Reconnect" : "Connect Google Calendar"}
      loading={connecting}
      onclick={() => void connect()}
    />
  </div>
</Panel>
