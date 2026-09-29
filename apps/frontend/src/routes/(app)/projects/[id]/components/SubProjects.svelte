<script lang="ts">
  import { goto } from "$app/navigation";
  import { ProjectCover } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Project } from "$lib/projects/types";
  import { Plus } from "lucide-svelte";

  /**
   * What sits under this one, as a line of links under its properties. A project holding projects
   * is a project all the same, so each is only a way in; the last chip makes another.
   */
  let { project }: { project: Project } = $props();

  const children = $derived(data.childrenOf(project.id));

  async function add() {
    const created = data.create(project);
    if (created) await goto(`/projects/${created.id}`);
  }
</script>

<div class="flex flex-wrap items-center gap-1.5">
  {#each children as child (child.id)}
    {@const card = data.cardOf(child)}
    <a href="/projects/{child.id}" class="chip-outline text-fg">
      <ProjectCover icon={child.icon} category={card.category} size={16} />
      {child.name || "Untitled project"}
      {#if card.total > 0}
        <span class="t-data-micro text-fg-faint">{card.done}/{card.total}</span>
      {/if}
    </a>
  {/each}
  <button type="button" onclick={add} class="bare-button t-micro h-7 px-2">
    <Plus size={12} />
    Sub-project
  </button>
</div>
