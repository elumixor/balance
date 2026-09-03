<script lang="ts">
  import type { ProjectStatus } from "$lib/types";
  import { STATUS_LABELS } from "$lib/projects/templates";

  /**
   * A project's status, only when it isn't plain active — a chip that reads "Active" on every
   * card is a chip nobody reads. Shipped is the one good ending and wears the positive tone;
   * the rest are quiet.
   */
  let { status }: { status: ProjectStatus } = $props();

  const tone = $derived(
    status === "shipped"
      ? "border-positive/40 text-positive"
      : status === "killed"
        ? "border-line text-fg-faint line-through"
        : "border-line-strong text-fg-muted",
  );
</script>

{#if status !== "active"}
  <span class="t-micro rounded-sm border px-1.5 py-px {tone}">{STATUS_LABELS[status]}</span>
{/if}
