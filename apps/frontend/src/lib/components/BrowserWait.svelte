<script lang="ts">
  import Button from "./Button.svelte";
  import Spinner from "./Spinner.svelte";

  /** Shown while a real browser window is off doing OAuth and the app can only wait for it. */
  let { message, oncancel }: { message: string; oncancel: () => void } = $props();
</script>

<div class="flex flex-col items-center gap-3 py-2" aria-busy="true">
  <Spinner size={20} />
  <p class="t-label text-center text-fg-muted">{message}</p>
  <Button label="Cancel" variant="outline" size="sm" onclick={oncancel} />
</div>
