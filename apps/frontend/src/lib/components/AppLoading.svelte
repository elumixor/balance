<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import BrandMark from "./BrandMark.svelte";
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
      <p class="t-label text-fg-muted">Sign-in didn't load. Check your connection and reopen the app.</p>
      <p class="t-data-micro break-words text-fg-faint">{auth.startupError}</p>
    </div>
  {/if}
</div>
