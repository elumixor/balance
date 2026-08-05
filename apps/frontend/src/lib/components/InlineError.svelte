<script lang="ts">
  /** Says what just failed, in place, without stealing the screen the way an alert would. */
  let { message }: { message: string | null } = $props();
</script>

{#if message}
  <p class="t-micro mb-3 text-danger">{message}</p>
{/if}
