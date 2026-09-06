<script lang="ts">
  import { Dot } from "$lib/components";
  import { restColor } from "$lib/ui/colors";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { CircleDashed, Flag } from "lucide-svelte";
  import DecisionFuse from "./DecisionFuse.svelte";
  import ProjectCover from "./ProjectCover.svelte";
  import type { ProjectCard } from "$lib/projects/projects-data.svelte";
  import StatusChip from "./StatusChip.svelte";
  import { gateReadout } from "$lib/projects/templates";

  /**
   * One project, closed: enough to know where it is without opening it. The fuse along the
   * bottom is the card's one strong mark — the rest is type in two greys and the sphere's dot.
   */
  let { card, today }: { card: ProjectCard; today: string } = $props();

  const color = $derived(card.category?.color ?? restColor);
  const name = $derived(card.project.name.trim() || "Untitled project");
  const gate = $derived(card.gate);
  const stage = $derived(card.stage);

  const countdown = $derived.by(() => {
    if (card.daysLeft === null) return null;
    if (card.daysLeft < 0) return `${-card.daysLeft}d overdue`;
    if (card.daysLeft === 0) return "decide today";
    return `${card.daysLeft}d`;
  });
</script>

<a
  href="/projects/{card.project.id}"
  class="press hoverable flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-left
    {card.archived ? 'opacity-70' : ''}"
>
  <div class="flex items-start gap-3">
    <ProjectCover cover={card.project.cover} category={card.category} />
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <span class="t-body-strong truncate text-fg">{name}</span>
        {#if stage && card.stageCount > 1}
          <span class="t-micro shrink-0 rounded-sm bg-surface-alt px-1.5 py-px text-fg-muted">
            {card.stageIndex}/{card.stageCount}
          </span>
        {/if}
      </div>
      {#if card.project.description.trim()}
        <p class="t-micro truncate text-fg-muted">{card.project.description}</p>
      {/if}
    </div>
  </div>

  <div class="t-micro flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
    <span class="flex items-center gap-1.5">
      <Dot {color} />
      {card.project.hoursPerWeek > 0 ? `${formatHoursDecimal(card.project.hoursPerWeek)}/wk` : "no hours"}
    </span>
    {#if stage}
      {#if gate?.measurable}
        <span class={gate.passed ? "text-positive" : ""}>{gateReadout(stage.metric, gate.count, gate.threshold)}</span>
      {:else if gate}
        <span class="flex items-center gap-1 text-fg-faint"><CircleDashed size={11} /> window not open</span>
      {/if}
    {/if}
    <StatusChip status={card.project.status} />
    {#if card.drift}
      <span class="flex items-center gap-1 text-fg-faint" title="No goal above this project"><Flag size={11} /> no goal</span>
    {/if}
  </div>

  {#if stage?.startedOn && stage.decideOn}
    <div class="flex items-center gap-3">
      <div class="flex-1">
        <DecisionFuse
          startedOn={stage.startedOn}
          decideOn={stage.decideOn}
          extendedOn={stage.extendedOn}
          {today}
          {color}
        />
      </div>
      <span class="t-micro w-16 shrink-0 text-right tabular-nums {card.daysLeft !== null && card.daysLeft < 0 ? 'text-danger' : 'text-fg-muted'}">
        {countdown}
      </span>
    </div>
  {/if}
</a>
