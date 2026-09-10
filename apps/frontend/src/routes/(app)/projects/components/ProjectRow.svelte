<script lang="ts">
  import { Avatars, Dot, ProjectCover, StatusChip } from "$lib/components";
  import type { ProjectCard } from "$lib/projects/projects-data.svelte";
  import { restColor } from "$lib/ui/colors";
  import { formatHoursDecimal } from "$lib/ui/format";

  /**
   * One project in the tree, closed: enough to know where it is without opening it. Depth is an
   * indent and a hairline rule down the left rather than a nested list, so a deep tree still
   * reads as one column — and the row keeps no border of its own, so the column reads as a list
   * rather than a wall of cards.
   */
  let { card, depth }: { card: ProjectCard; depth: number } = $props();

  const color = $derived(card.category?.color ?? restColor);
  const name = $derived(card.project.name.trim() || "Untitled project");
  const logged = $derived(card.rolledUpByWeek.at(-1) ?? 0);
  const claim = $derived(card.project.hoursPerWeek);
</script>

<a
  href="/projects/{card.project.id}"
  style="padding-left:{depth * 18}px"
  class="hoverable group flex items-center gap-2.5 rounded-md py-1.5 pr-2 {card.archived ? 'opacity-60' : ''}"
>
  {#if depth > 0}
    <span class="h-5 w-px shrink-0 bg-line-strong"></span>
  {/if}
  <ProjectCover icon={card.project.icon} category={card.category} size={22} />

  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-2">
      <span class="t-label truncate text-fg">{name}</span>
      <StatusChip status={card.project.status} />
    </span>
    {#if card.project.description.trim()}
      <span class="t-micro block truncate text-fg-faint">{card.project.description}</span>
    {/if}
  </span>

  {#if card.total > 0}
    <span class="t-data-micro shrink-0 text-fg-faint">{card.done}/{card.total}</span>
  {/if}
  <Avatars people={card.members} size={17} max={4} />
  {#if claim > 0}
    <span class="t-data-micro flex shrink-0 items-center gap-1.5 text-fg-muted">
      <Dot {color} size={5} />
      {formatHoursDecimal(logged)}<span class="text-fg-faint">/{formatHoursDecimal(claim)}</span>
    </span>
  {/if}
</a>
