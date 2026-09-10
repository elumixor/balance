<script lang="ts">
  import type { Project } from "$lib/projects/types";

  /**
   * How one sphere's week is spoken for, as a strip: a segment per project that claims hours, in
   * the sphere's own colour, and what is left of the ring's hours faint at the end. It is the
   * dial's answer flattened onto a line — the same question the planning ring asks, one level
   * down, where the answer is "which projects" rather than "which spheres".
   */
  let { projects, hours, color }: { projects: readonly Project[]; hours: number; color: string } = $props();

  const claiming = $derived(
    projects.filter((project) => project.status === "active" && project.hoursPerWeek > 0),
  );
  const claimed = $derived(claiming.reduce((total, project) => total + project.hoursPerWeek, 0));
  /** The strip is as long as the ring allows, or as long as the claims when they exceed it. */
  const scale = $derived(Math.max(hours, claimed) || 1);
  const over = $derived(Math.max(0, claimed - hours));
</script>

{#if claiming.length > 0}
  <div class="flex h-1.5 gap-px overflow-hidden rounded-sm bg-surface-alt" aria-hidden="true">
    {#each claiming as project, index (project.id)}
      <span
        style="flex:{project.hoursPerWeek / scale};background:color-mix(in oklab,{color} {Math.max(
          35,
          92 - index * 14,
        )}%,transparent)"
      ></span>
    {/each}
    {#if claimed < hours}
      <span style="flex:{(hours - claimed) / scale}"></span>
    {/if}
  </div>
  {#if over > 0}
    <p class="t-data-micro text-fg-faint">{over.toFixed(1)}h more claimed than the ring gives this sphere.</p>
  {/if}
{/if}
