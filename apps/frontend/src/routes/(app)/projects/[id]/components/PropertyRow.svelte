<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * One line of what a project says about itself — an icon, what the line is called, and its
   * answer on the right. Everything beside a project's name is one of these, whether the app
   * named it (hours a week, status, the workspace it is mirrored from) or the workspace did, so
   * a mirrored field and a local one read as the same kind of thing.
   */
  let {
    icon,
    label,
    name,
    children,
  }: {
    icon: Snippet;
    /** The plain name of the row. A row whose name is typed passes `name` instead. */
    label?: string;
    name?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="group flex min-h-7 items-center gap-2">
  <div class="flex min-w-0 flex-1 items-center gap-2 text-fg-muted">
    {@render icon()}
    {#if name}
      {@render name()}
    {:else}
      <span class="t-micro truncate px-2">{label}</span>
    {/if}
  </div>
  <div class="flex min-w-0 flex-1 items-center justify-end gap-1">
    {@render children()}
  </div>
</div>
