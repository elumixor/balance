<script lang="ts">
  import CopyButton from "./CopyButton.svelte";

  /**
   * Says what just failed, in place, without stealing the screen the way an alert would.
   *
   * One line of it, however long what came back was: a failed write answers with the query it
   * failed on, and a message allowed to wrap covers the thing it is about. The whole of it copies.
   */
  let { message }: { message: string | null } = $props();
</script>

{#if message}
  <div class="mb-3 flex items-center gap-1">
    <p class="t-micro min-w-0 flex-1 truncate text-danger" title={message}>{message}</p>
    <CopyButton text={() => message} label="Copy error details" size={13} />
  </div>
{/if}
