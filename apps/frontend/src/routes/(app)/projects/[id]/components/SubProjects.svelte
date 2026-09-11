<script lang="ts">
  import { goto } from "$app/navigation";
  import { ProjectCover, StatusChip } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Project } from "$lib/projects/types";
  import { ChevronRight, Plus } from "lucide-svelte";

  /** What sits under this one. A project holding projects is a project all the same. */
  let { project }: { project: Project } = $props();

  const children = $derived(data.childrenOf(project.id));

  async function add() {
    const created = data.create(project);
    if (created) await goto(`/projects/${created.id}`);
  }
</script>

<section class="space-y-1">
  <h2 class="t-micro px-2 text-fg-muted">Under this</h2>
  <ul>
    {#each children as child (child.id)}
      {@const card = data.cardOf(child)}
      <li>
        <a href="/projects/{child.id}" class="hoverable flex items-center gap-2 rounded-md px-2 py-1">
          <ProjectCover icon={child.icon} category={card.category} size={18} />
          <span class="t-micro min-w-0 flex-1 truncate text-fg">{child.name || "Untitled project"}</span>
          {#if card.total > 0}
            <span class="t-data-micro shrink-0 text-fg-faint">{card.done}/{card.total}</span>
          {/if}
          <StatusChip status={child.status} />
          <ChevronRight size={13} class="shrink-0 text-fg-faint" />
        </a>
      </li>
    {/each}
    <li>
      <button type="button" onclick={add} class="bare-button t-micro px-2 py-1">
        <Plus size={12} />
        Sub-project
      </button>
    </li>
  </ul>
</section>
