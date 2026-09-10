<script lang="ts">
  import { Avatars, Dot, ProjectCover, StatusChip } from "$lib/components";
  import type { ProjectCard } from "$lib/projects/projects-data.svelte";
  import { restColor } from "$lib/ui/colors";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { CornerDownRight } from "lucide-svelte";

  /**
   * One project in the tree, closed: enough to know where it is without opening it. Depth is an
   * indent and a small elbow rather than a nested list, so a deep tree still reads as one column.
   */
  let { card, depth }: { card: ProjectCard; depth: number } = $props();

  const color = $derived(card.category?.color ?? restColor);
  const name = $derived(card.project.name.trim() || "Untitled project");
  const hours = $derived(card.hoursByWeek.at(-1) ?? 0);
</script>

<a
  href="/projects/{card.project.id}"
  style="margin-left:{depth * 20}px"
  class="press hoverable flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5
    {card.archived ? 'opacity-60' : ''}"
>
  {#if depth > 0}
    <CornerDownRight size={12} class="shrink-0 text-fg-faint" />
  {/if}
  <ProjectCover icon={card.project.icon} category={card.category} size={26} />

  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-2">
      <span class="t-body-strong truncate text-fg">{name}</span>
      <StatusChip status={card.project.status} />
    </span>
    {#if card.project.description.trim()}
      <span class="t-micro block truncate text-fg-muted">{card.project.description}</span>
    {/if}
  </span>

  {#if card.total > 0}
    <span class="t-micro shrink-0 tabular-nums text-fg-muted">{card.done}/{card.total}</span>
  {/if}
  <Avatars people={card.members} size={18} max={4} />
  <span class="t-micro flex shrink-0 items-center gap-1.5 tabular-nums text-fg-muted">
    <Dot {color} size={6} />
    {card.project.hoursPerWeek > 0 ? `${formatHoursDecimal(hours)}/${formatHoursDecimal(card.project.hoursPerWeek)}` : "—"}
  </span>
</a>
