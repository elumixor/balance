<script lang="ts">
  import { auth } from "$lib/account/auth.svelte";
  import BrandMark from "./BrandMark.svelte";
  import Button from "./Button.svelte";

  let retrying = $state(false);

  async function retry() {
    retrying = true;
    try {
      await auth.retry();
    } catch {
      // The message is already on screen — `startupError` carries whatever went wrong this time.
    } finally {
      retrying = false;
    }
  }
</script>

<!--
  What the app shows while it works out who you are. A blank frame here would mean seconds
  of empty background on a cold web visit, since the shell is what the static build serves.
-->
<div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6">
  <BrandMark size={56} />
  {#if auth.startupError}
    <div class="max-w-sm space-y-1 text-center">
      <p class="t-body">Balance couldn't start</p>
      <p class="t-label text-fg-muted">Sign-in didn't load. Check your connection and try again.</p>
      <p class="t-data-micro break-words text-fg-faint">{auth.startupError}</p>
    </div>
    <!-- Reopening the app was the only way out of this, and on a phone that means killing it
         from the switcher first — a fix nobody guesses at. -->
    <Button label="Try again" variant="outline" size="sm" loading={retrying} onclick={() => void retry()} />
  {/if}
</div>
