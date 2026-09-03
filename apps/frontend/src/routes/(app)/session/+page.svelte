<script lang="ts">
  import { page } from "$app/state";
  import Button from "$lib/components/Button.svelte";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SplitBar from "$lib/components/SplitBar.svelte";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import StarPill from "$lib/planning/StarPill.svelte";
  import type { Slot } from "$lib/planning/types";
  import { slotNow } from "$lib/planning/zone";
  import { goto } from "$app/navigation";

  /**
   * The sitting itself: what went well, and one way forward.
   *
   * Wins and what is ahead are one screen rather than two, because they are one thought — the day
   * you had is the argument for the day you are about to draw. Planning is the screen after this
   * one, and it is the calendar, so nothing here has to teach a second way of moving a block.
   *
   * There is no failure anywhere on this page by construction: the copy is written under a rule
   * that forbids it, and everything drawn from numbers here is a thing that happened rather than a
   * thing that didn't.
   */
  const data = sessionData;

  const slot = $derived((page.url.searchParams.get("slot") as Slot | null) ?? slotNow());
  const summary = $derived(data.summary);
  const week = $derived(summary?.week ?? null);

  $effect(() => void data.enter(slot));

  const splits = $derived(
    data.categories.map((category) => ({ id: category.categoryId, color: category.color, value: category.hours })),
  );

  const eventById = $derived(new Map((summary?.review.top ?? []).map((block) => [block.id, block])));

  /** What the button says depends only on whether the day has been planned, and what that pays. */
  const planStars = $derived((summary?.award ?? []).reduce((sum, award) => sum + award.delta, 0) + (summary?.weeklyAward ?? 0));

  function plan() {
    if (!summary) return;
    planMode.start({
      day: summary.target.day,
      budgetHours: summary.target.budgetHours,
      threshold: summary.coverageThreshold,
      award: summary.award,
      weekStart: summary.slot === "weekly" && summary.weeklyAward > 0 ? nextWeekStart(summary.today) : null,
      weeklyAward: summary.slot === "weekly" ? summary.weeklyAward : 0,
    });
  }

  /** The Monday after the week being reviewed — the week the Sunday sitting is actually drawing. */
  function nextWeekStart(today: string) {
    const [year, month, day] = today.split("-").map(Number);
    const at = new Date(year, month - 1, day);
    const weekday = at.getDay() === 0 ? 7 : at.getDay();
    at.setDate(at.getDate() + (8 - weekday));
    return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, "0")}-${`${at.getDate()}`.padStart(2, "0")}`;
  }

  function hours(value: number) {
    return `${Math.round(value * 10) / 10}h`;
  }
</script>

<Screen title={summary?.copy.title ?? "Your day"} subtitle={summary?.copy.body}>
  {#if !summary}
    <div class="space-y-4">
      <Skeleton width="100%" height={18} />
      <Skeleton width="70%" height={18} />
      <Skeleton width="100%" height={96} />
    </div>
  {:else}
    <div class="flex items-center justify-between gap-3">
      <StarPill rank={summary.rank} />
      {#if summary.streak > 1}
        <span class="t-micro text-fg-muted">{summary.streak} days in a row</span>
      {/if}
    </div>

    {#if splits.length > 0}
      <section class="mt-6 space-y-3">
        <SplitBar {splits} />
        <ul class="space-y-1.5">
          {#each data.categories.slice(0, 5) as category (category.categoryId)}
            <li class="flex items-center gap-2">
              <CategoryIcon icon={category.icon} color={category.color} size={14} />
              <span class="t-label flex-1">{category.name}</span>
              <span class="t-label tabular-nums text-fg-muted">{hours(category.hours)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- The points are the session. Everything above is the evidence they stand on. -->
    <ul class="mt-8 space-y-4">
      {#each summary.copy.points as point, index (index)}
        <li class="flex gap-3">
          <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink"></span>
          <div class="space-y-1.5">
            <p class="t-body">{point.text}</p>
            {#if point.eventId && eventById.get(point.eventId)}
              {@const block = eventById.get(point.eventId)}
              <button
                type="button"
                class="press t-micro inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-fg-muted"
                onclick={() => goto("/calendar")}
              >
                {#if block?.icon && block?.color}
                  <CategoryIcon icon={block.icon} color={block.color} size={12} />
                {/if}
                {block?.title}
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    {#if week}
      <!-- The week, on the one evening it is the subject rather than the backdrop. -->
      <section class="mt-10 border-t border-line pt-8">
        <h2 class="t-label mb-3">The week behind you</h2>
        <p class="t-body text-fg-muted">
          {hours(week.hours)} accounted for, and {Math.round(week.match * 100)}% of the shape you drew.
        </p>
        <ul class="mt-4 space-y-1.5">
          {#each week.categories.filter((category) => category.hours > 0).slice(0, 6) as category (category.categoryId)}
            <li class="flex items-center gap-2">
              <CategoryIcon icon={category.icon} color={category.color} size={14} />
              <span class="t-label flex-1">{category.name}</span>
              <span class="t-label tabular-nums text-fg-muted">
                {hours(category.hours)} of {hours(category.targetHours)}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="mt-10 space-y-3">
      <Button
        full
        label={summary.target.planned
          ? `Look over ${summary.slot === "morning" ? "today" : "tomorrow"}`
          : `Plan ${summary.slot === "morning" ? "today" : "tomorrow"}${planStars > 0 ? ` · +${planStars} ★` : ""}`}
        onclick={plan}
      />
      <Button full variant="outline" label="Not now" onclick={() => goto("/calendar")} />
    </div>
  {/if}
</Screen>
