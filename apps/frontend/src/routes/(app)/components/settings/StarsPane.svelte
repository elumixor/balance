<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button, Skeleton, StarPill, Tooltip } from "$lib/components";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { progressData } from "$lib/planning/progress.svelte";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import { slotNow } from "$lib/planning/zone";
  import { settings } from "$lib/settings";
  import { Check, Flame } from "lucide-svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * The record behind the star. Where you are and what is next come first, because that is what
   * the badge was pressed for; the numbers and the achievements are underneath, for the days
   * somebody wants to look at them.
   *
   * The two buttons are the sitting, reachable on purpose rather than only from a notification:
   * the last recap, and the day the recap leads to — planned, or planned again.
   */
  progressData.ensure();
  $effect(() => void sessionData.enter(slotNow()));

  const progress = $derived(progressData.value);
  const summary = $derived(sessionData.summary);
  const subject = $derived(summary?.slot === "morning" ? "today" : "tomorrow");

  const stats = $derived(
    progress
      ? [
          { label: "Best streak", value: `${progress.bestStreak}d` },
          { label: "Days planned", value: `${progress.plannedDays}` },
          { label: "Planned ahead", value: `${progress.aheadDays}` },
          { label: "Rest days", value: `${progress.restDays}` },
          { label: "Weeks planned", value: `${progress.weeksPlanned}` },
          { label: "Earned this week", value: `+${progress.weekStars} ★` },
        ]
      : [],
  );

  function openRecap() {
    settings.hide();
    void goto("/session");
  }

  function plan() {
    if (!summary) return;
    settings.hide();
    planMode.startFrom(summary);
  }

  function dayLabel(day: string) {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
</script>

<SettingsGroup title="Stars" divided={false}>
  {#if !progress}
    <div class="space-y-3">
      <Skeleton width="50%" height={28} />
      <Skeleton width="100%" height={80} radius={10} />
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <StarPill rank={progress.rank} />
      {#if progress.streak > 0}
        <span class="t-label flex items-center gap-1.5 text-fg-muted">
          <Flame size={14} class="text-amber-400" />
          {progress.streak} {progress.streak === 1 ? "day" : "days"} in a row
        </span>
      {/if}
    </div>

    <!-- The sitting, on demand. -->
    <div class="mt-5 flex flex-wrap gap-2">
      <Button label="Last recap" variant="outline" size="sm" onclick={openRecap} />
      {#if summary}
        <Button
          label={summary.target.planned ? `Re-plan ${subject}` : `Plan ${subject}`}
          size="sm"
          onclick={plan}
        />
      {/if}
    </div>

    <!-- Four weeks of days: lit when planned, amber when planned the evening before. -->
    <div class="mt-6 grid grid-cols-14 gap-1">
      {#each progress.recent as cell (cell.day)}
        <Tooltip label="{dayLabel(cell.day)}{cell.stars ? ` · ${cell.stars > 0 ? '+' : ''}${cell.stars} ★` : ''}">
          <span
            class="block aspect-square w-full rounded-sm {cell.planned
              ? cell.ahead
                ? 'bg-amber-400'
                : 'bg-ink'
              : 'bg-surface-alt'} {cell.rest ? 'opacity-50' : ''}"
          ></span>
        </Tooltip>
      {/each}
    </div>

    <dl class="mt-6 grid grid-cols-3 gap-x-4 gap-y-3">
      {#each stats as stat (stat.label)}
        <div>
          <dt class="t-micro text-fg-faint">{stat.label}</dt>
          <dd class="t-data-strong">{stat.value}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</SettingsGroup>

{#if progress}
  <SettingsGroup title="Achievements">
    <ul class="space-y-3">
      {#each progress.achievements as achievement (achievement.id)}
        <li class="flex items-center gap-3">
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-full {achievement.earned
              ? 'bg-amber-400 text-ink-fg'
              : 'border border-line-strong text-fg-faint'}"
          >
            {#if achievement.earned}<Check size={14} strokeWidth={3} />{/if}
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
  </SettingsGroup>
{/if}
