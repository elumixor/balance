<script lang="ts">
  import Button from "./Button.svelte";

  /**
   * What one screen shows when it threw on the way to being drawn. The shell around it — the tabs,
   * the rail, the settings — is still there and still works, which is the difference between "this
   * screen broke" and "the app is dead".
   */
  let { error, reset }: { error: unknown; reset: () => void } = $props();

  const message = $derived(error instanceof Error ? error.message : String(error));
</script>

<div class="flex h-full items-center justify-center p-6">
  <div class="flex max-w-sm flex-col items-start gap-3">
    <div class="space-y-1">
      <p class="t-body">This screen didn't draw</p>
      <p class="t-label text-fg-muted">
        Something it was given wasn't what it expected. The rest of the app still works.
      </p>
      <p class="t-data-micro break-words text-fg-faint">{message}</p>
    </div>
    <Button label="Try again" variant="outline" size="sm" onclick={reset} />
  </div>
</div>
