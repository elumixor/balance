<script lang="ts">
  import Button from "./Button.svelte";
  import CopyButton from "./CopyButton.svelte";

  /**
   * Shown when a screen's data never arrived. Says what happened and offers the fix.
   *
   * One row, the size of what it has to say: what a screen floats this over — a week, a gallery —
   * is still worth seeing, so the card takes a corner rather than the width. The sentence is cut
   * where it stops fitting, since what comes back can be a database query a page long, and the
   * whole of it is a copy away, which is the shape it is actually wanted in.
   */
  let { message, onretry }: { message?: string | null; onretry: () => void } = $props();

  const fallback = "Something went wrong on the way to the server.";
</script>

<div
  class="flex w-full max-w-sm items-center gap-2 rounded-lg border border-danger/40 bg-surface py-2 pr-1 pl-3
    shadow-(--shadow-float)"
>
  <div class="min-w-0 flex-1">
    <p class="t-micro text-danger">Couldn't load your data</p>
    <p class="t-label truncate text-fg-muted" title={message ?? fallback}>{message ?? fallback}</p>
  </div>
  <Button label="Try again" variant="outline" size="sm" onclick={onretry} />
  <CopyButton text={() => message ?? fallback} label="Copy error details" />
</div>
