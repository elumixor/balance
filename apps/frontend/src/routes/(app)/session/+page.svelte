<script lang="ts">
  import { page } from "$app/state";
  import { Button, CategoryIcon, Skeleton, StarBurst, StarCount, StarPill } from "$lib/components";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { DAY_STARS, dayRating } from "$lib/planning/rating";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import { BalanceRing, DoneFan, DoneList } from "./components";
  import type { Slot } from "$lib/planning/types";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { goto } from "$app/navigation";

  /**
   * The sitting itself: what was done, thrown down like a hand of cards, the stars it earned, the
   * day as a dial, the list of it — and one button at the bottom for the day after.
   *
   * The review is a payout, so the screen is built like one: the loudest thing on it is the
   * evidence of the day, and the words come after. Planning is the screen after this one, and it
   * is the calendar, so nothing here has to teach a second way of moving a block.
   *
   * There is no failure anywhere on this page by construction: the copy is written under a rule
   * that forbids it, and everything drawn from numbers here is a thing that happened rather than a
   * thing that didn't.
   */
  const data = sessionData;

  const slot = $derived((page.url.searchParams.get("slot") as Slot | null) ?? sessionNudge.slot);
  const summary = $derived(data.summary);
  const week = $derived(summary?.week ?? null);

  $effect(() => void data.enter(slot));

  const rating = $derived(summary ? dayRating(summary.review, summary.coverageThreshold) : 0);
  const eventById = $derived(new Map((summary?.review.top ?? []).map((block) => [block.id, block])));
  const nextDay = $derived(summary?.slot === "morning" ? "today" : "tomorrow");

  /** What the button says depends only on whether the day has been planned, and what that pays. */
  const planStars = $derived((summary?.award ?? []).reduce((sum, award) => sum + award.delta, 0) + (summary?.weeklyAward ?? 0));

  const reviewDate = $derived.by(() => {
    if (!summary) return "";
    const [year, month, day] = summary.review.day.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  });

  function plan() {
    if (summary) planMode.startFrom(summary);
  }

  function hours(value: number) {
    return `${Math.round(value * 10) / 10}h`;
  }

  /** The caption under the stars only ever names what happened. */
  const starsCaption = $derived.by(() => {
    if (!summary) return "";
    if (summary.review.rest) return "A rest day, kept";
    if (summary.review.mappedHours > 0) return `${hours(summary.review.mappedHours)} given a meaning`;
    return "A day off the record";
  });
</script>

<!-- The scroll is the whole screen's, so its bar sits at the window's edge rather than beside a
     column in the middle of it; the column is centred inside. It scrolls under a footer that never
     leaves the thumb. -->
<div class="h-full w-full overflow-y-auto">
  <div class="safe-top-6 mx-auto flex min-h-full w-full max-w-md flex-col px-5 md:pt-12 [&>*]:shrink-0">
    {#if !summary}
      <div class="space-y-4 pt-10">
        <Skeleton width="100%" height={176} radius={12} />
        <Skeleton width="70%" height={36} />
        <Skeleton width="100%" height={124} radius={12} />
      </div>
    {:else}
      <p class="t-micro text-center text-fg-faint">{reviewDate}</p>

      <DoneFan blocks={summary.review.top} />

      <h1 class="t-title mt-2 text-center">{summary.copy.title}</h1>
      {#if summary.copy.body}
        <p class="t-body mt-2 text-center text-fg-muted">{summary.copy.body}</p>
      {/if}

      <div class="mt-8 flex flex-col items-center gap-2">
        <StarBurst lit={rating} of={DAY_STARS} />
        <p class="t-label text-fg-muted">{starsCaption}</p>
      </div>

      <div class="mt-5 flex items-center justify-center gap-3">
        <StarPill rank={summary.rank} />
        {#if summary.streak > 1}
          <span class="t-micro text-fg-muted">{summary.streak} days in a row</span>
        {/if}
      </div>

      {#if data.categories.length > 0}
        <section class="mt-10">
          <BalanceRing categories={data.categories} hours={summary.review.hours} />
        </section>
      {/if}

      {#if summary.review.blocks.length > 0}
        <section class="mt-8">
          <h2 class="t-label mb-2 text-fg-muted">Done</h2>
          <DoneList blocks={summary.review.blocks} />
        </section>
      {/if}

      {#if summary.copy.points.length > 0}
        <ul class="mt-8 space-y-3">
          {#each summary.copy.points as point, index (index)}
            {@const block = point.eventId ? eventById.get(point.eventId) : undefined}
            <li class="space-y-1.5">
              <p class="t-body text-fg-muted">{point.text}</p>
              {#if block}
                <button
                  type="button"
                  class="press t-micro inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-fg-muted"
                  onclick={() => goto("/calendar")}
                >
                  {#if block.icon && block.color}
                    <CategoryIcon icon={block.icon} color={block.color} size={12} />
                  {/if}
                  {block.title}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if week}
        <!-- The week, on the one evening it is the subject rather than the backdrop. -->
        <section class="mt-10 border-t border-line pt-8">
          <h2 class="t-label mb-2 text-fg-muted">The week behind you</h2>
          <p class="t-body">
            {hours(week.hours)} accounted for, and {Math.round(week.match * 100)}% of the shape you drew.
          </p>
          <ul class="mt-4 space-y-1.5">
            {#each week.categories.filter((category) => category.hours > 0).slice(0, 6) as category (category.categoryId)}
              <li class="flex items-center gap-2">
                <CategoryIcon icon={category.icon} color={category.color} size={14} />
                <span class="t-label flex-1">{category.name}</span>
                <span class="t-data text-fg-muted">{hours(category.hours)} of {hours(category.targetHours)}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Pinned: the day after is the reason the review exists, so the way into it never scrolls off. -->
      <div class="sticky bottom-0 mt-auto bg-bg pt-6 pb-4">
        <p class="t-micro mb-2 text-center text-fg-muted capitalize">{nextDay}</p>
        <Button
          full
          label={summary.target.planned ? `Look over ${nextDay}` : `Plan ${nextDay}`}
          onclick={plan}
        />
        {#if !summary.target.planned && planStars > 0}
          <p class="t-label mt-2 text-center text-fg-muted"><StarCount value={planStars} size={13} /> for two minutes</p>
        {/if}
        <button type="button" class="t-micro mx-auto mt-2 block text-fg-faint" onclick={() => goto("/calendar")}>
          Not now
        </button>
      </div>
    {/if}
  </div>
</div>
