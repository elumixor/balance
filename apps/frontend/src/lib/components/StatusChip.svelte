<script lang="ts">
  import type { ProjectStatus } from "$lib/projects/types";

  /**
   * A project's status, only when it isn't plain active — a chip that reads "Active" on every
   * card is a chip nobody reads. Done is the one good ending and wears the positive tone; the
   * rest are quiet.
   */
  let { status }: { status: ProjectStatus } = $props();

  const LABELS: Record<ProjectStatus, string> = {
    active: "Active",
    paused: "Paused",
    done: "Done",
    dropped: "Dropped",
  };

  const tone = $derived(
    status === "done"
      ? "border-positive/40 text-positive"
      : status === "dropped"
        ? "border-line text-fg-faint line-through"
        : "border-line-strong text-fg-muted",
  );
</script>

{#if status !== "active"}
  <span class="t-micro rounded-sm border px-1.5 py-px {tone}">{LABELS[status]}</span>
{/if}
