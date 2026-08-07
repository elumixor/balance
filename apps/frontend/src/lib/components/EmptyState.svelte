<script lang="ts">
  import type { Snippet } from "svelte";

  /** An empty list says what's missing, and — when there's somewhere to go — where to go next. */
  let { title, hint, action }: { title: string; hint?: string; action?: Snippet } = $props();
</script>

<div class="space-y-1 py-6">
  <p class="t-body text-fg-muted">{title}</p>
  {#if hint}
    <p class="t-label text-fg-faint">{hint}</p>
  {/if}
  {#if action}
    <div class="pt-3">{@render action()}</div>
  {/if}
</div>
