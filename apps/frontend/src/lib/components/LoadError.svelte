<script lang="ts">
  import Button from "./Button.svelte";
  import CopyButton from "./CopyButton.svelte";
  import Panel from "./Panel.svelte";

  /**
   * Shown when a screen's data never arrived. Says what happened and offers the fix.
   *
   * One line for why, cut where it stops fitting: what comes back from the server can be a database
   * query a page long, and a card that grows to hold it covers the screen it is sitting on top of.
   * The whole of it is a copy away, which is the shape it is actually wanted in.
   */
  let { message, onretry }: { message?: string | null; onretry: () => void } = $props();

  const fallback = "Something went wrong on the way to the server.";
</script>

<Panel>
  <div class="flex items-start gap-2">
    <div class="min-w-0 flex-1 space-y-1">
      <p class="t-body">Couldn't load your data</p>
      <p class="t-label truncate text-fg-muted" title={message ?? fallback}>{message ?? fallback}</p>
      <div class="pt-2"><Button label="Try again" variant="outline" size="sm" onclick={onretry} /></div>
    </div>
    {#if message}
      <CopyButton text={() => message} label="Copy error details" />
    {/if}
  </div>
</Panel>
