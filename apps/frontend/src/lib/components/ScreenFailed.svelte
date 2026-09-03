<script lang="ts">
  import Button from "./Button.svelte";
  import CopyButton from "./CopyButton.svelte";

  /**
   * What one screen shows when it threw on the way to being drawn. The shell around it — the tabs,
   * the rail, the settings — is still there and still works, which is the difference between "this
   * screen broke" and "the app is dead".
   */
  let { error, reset }: { error: unknown; reset: () => void } = $props();

  const message = $derived(error instanceof Error ? error.message : String(error));
  const detail = $derived(error instanceof Error ? (error.stack ?? message) : message);
</script>

<div class="flex h-full items-center justify-center p-6">
  <div class="flex max-w-sm min-w-0 flex-col items-start gap-3">
    <div class="min-w-0 space-y-1 self-stretch">
      <p class="t-body">This screen didn't draw</p>
      <p class="t-label text-fg-muted">
        Something it was given wasn't what it expected. The rest of the app still works.
      </p>
      <div class="flex items-center gap-1">
        <p class="t-data-micro min-w-0 flex-1 truncate text-fg-faint" title={message}>{message}</p>
        <CopyButton text={() => detail} label="Copy error details" />
      </div>
    </div>
    <Button label="Try again" variant="outline" size="sm" onclick={reset} />
  </div>
</div>
