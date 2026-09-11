<script lang="ts">
  import type { Project } from "$lib/projects/types";
  import { ChevronRight } from "lucide-svelte";

  /** Where this sits — "Projects / ATMA / Hypocrisy", every step of it a link but the last. */
  let { path }: { path: readonly Project[] } = $props();
</script>

<nav class="t-micro flex min-w-0 items-center gap-1 text-fg-faint">
  <a href="/projects" class="hoverable shrink-0 rounded-sm px-1 py-0.5">Projects</a>
  {#each path as project, index (project.id)}
    <ChevronRight size={11} />
    {#if index === path.length - 1}
      <span class="truncate px-1 py-0.5 text-fg-muted">{project.name || "Untitled"}</span>
    {:else}
      <a href="/projects/{project.id}" class="hoverable truncate rounded-sm px-1 py-0.5">{project.name || "Untitled"}</a>
    {/if}
  {/each}
</nav>
