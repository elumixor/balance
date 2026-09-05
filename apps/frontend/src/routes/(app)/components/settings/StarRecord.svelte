<script lang="ts">
  import { StarCount, Tooltip } from "$lib/components";
  import type { StarProgress } from "$lib/planning/types";
  import { Check, ChevronRight } from "lucide-svelte";

  /**
   * The record behind the count, folded away: four weeks of days, the totals and the
   * achievements. The count and the two buttons above are what the page is opened for; this is
   * for the days somebody wants to look.
   */
  let { progress }: { progress: StarProgress } = $props();

  let open = $state(false);

  const stats = $derived([
    { label: "Best streak", value: `${progress.bestStreak}d` },
    { label: "Days planned", value: `${progress.plannedDays}` },
    { label: "Planned ahead", value: `${progress.aheadDays}` },
    { label: "Rest days", value: `${progress.restDays}` },
    { label: "Weeks planned", value: `${progress.weeksPlanned}` },
    { label: "This week", value: progress.weekStars },
  ]);

  const earned = $derived(progress.achievements.filter((achievement) => achievement.earned).length);

  function dayLabel(day: string) {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
</script>

<button
  type="button"
  aria-expanded={open}
  onclick={() => (open = !open)}
  class="press-sm t-micro mt-4 flex items-center gap-1 text-fg-faint hoverable rounded-md py-0.5 pr-1.5"
>
  <ChevronRight size={13} class="transition-transform duration-150 {open ? 'rotate-90' : ''}" />
  Record · {earned} of {progress.achievements.length} achievements
</button>

{#if open}
  <!-- Four weeks of days: lit when planned, green when planned the evening before. -->
  <div class="mt-3 grid grid-cols-14 gap-1">
    {#each progress.recent as cell (cell.day)}
      <Tooltip label="{dayLabel(cell.day)}{cell.stars > 0 ? `, +${cell.stars} stars` : ''}">
        <span
          class="block aspect-square w-full rounded-sm {cell.planned
            ? cell.ahead
              ? 'bg-positive'
              : 'bg-ink'
            : 'bg-surface-alt'} {cell.rest ? 'opacity-50' : ''}"
        ></span>
      </Tooltip>
    {/each}
  </div>

  <dl class="mt-5 grid grid-cols-3 gap-x-4 gap-y-3">
    {#each stats as stat (stat.label)}
      <div>
        <dt class="t-micro text-fg-faint">{stat.label}</dt>
        <dd class="t-data">
          {#if typeof stat.value === "number"}<StarCount value={stat.value} size={13} />{:else}{stat.value}{/if}
        </dd>
      </div>
    {/each}
  </dl>

  <ul class="mt-5 space-y-2.5">
    {#each progress.achievements as achievement (achievement.id)}
      <li class="flex items-center gap-3">
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full {achievement.earned
            ? 'bg-ink text-ink-fg'
            : 'border border-line-strong text-fg-faint'}"
        >
          {#if achievement.earned}<Check size={12} strokeWidth={3} />{/if}
        </span>
        <div class="min-w-0 flex-1">
          <p class="t-label {achievement.earned ? 'text-fg' : 'text-fg-muted'}">{achievement.label}</p>
          <p class="t-micro text-fg-faint">{achievement.detail}</p>
          {#if !achievement.earned && achievement.progress > 0}
            <div class="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-surface-alt">
              <div class="h-full bg-line-strong" style="width:{Math.round(achievement.progress * 100)}%"></div>
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}
