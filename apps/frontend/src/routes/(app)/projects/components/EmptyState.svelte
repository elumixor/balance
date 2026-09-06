<script lang="ts">
  let { title, hint }: { title: string; hint?: string } = $props();
</script>

<div class="space-y-1 py-6">
  <p class="t-body text-fg-muted">{title}</p>
  {#if hint}
    <p class="t-label text-fg-faint">{hint}</p>
  {/if}
</div>
