<script lang="ts">
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { viewport } from "$lib/platform/viewport.svelte";

  /**
   * The weekday and date over each column. Unkeyed: the columns are fixed slots the days move
   * through, and moving DOM nodes under a scroller resets the very scroll offset the grid is holding.
   */
  let {
    days,
    columns,
    todayStart,
    height,
  }: {
    days: readonly Date[];
    /** The strip's `grid-template-columns`, shared with the rows and the hours below. */
    columns: string;
    todayStart: number;
    height: number;
  } = $props();
</script>

<div class="grid" style="grid-template-columns:{columns};height:{height}px">
  {#each days as day}
    {@const today = day.getTime() === todayStart}
    {@const planning = planMode.isDay(day)}
    <div class="flex items-center justify-center gap-1 border-line border-l px-1 text-center {planning ? 'plan-day' : ''}">
      <span class="t-micro {today ? 'text-danger' : 'text-fg-faint'}">
        {day.toLocaleDateString(undefined, { weekday: viewport.md ? "short" : "long" })}
      </span>
      <span
        class="t-micro flex h-5 min-w-5 items-center justify-center rounded-md px-1 tabular-nums {today
          ? 'bg-danger text-ink-fg'
          : 'text-fg-muted'}"
      >
        {day.getDate()}
      </span>
    </div>
  {/each}
</div>

<style>
  /**
   * The day being planned, breathing.
   *
   * On the heading rather than down the column: a glow behind twelve hours of blocks makes the
   * blocks harder to read, and the heading is where the eye goes to answer "which day is this".
   */
  .plan-day {
    animation: plan-pulse 2.4s ease-in-out infinite;
    border-radius: 0.375rem;
  }

  @keyframes plan-pulse {
    0%,
    100% {
      background-color: color-mix(in oklab, var(--color-cyan-400) 12%, transparent);
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-cyan-400) 30%, transparent);
    }
    50% {
      background-color: color-mix(in oklab, var(--color-cyan-400) 22%, transparent);
      box-shadow: 0 0 12px 2px color-mix(in oklab, var(--color-cyan-400) 22%, transparent);
    }
  }

  /* A pulse that never stops is a problem for anyone who asked the system to stop them. */
  @media (prefers-reduced-motion: reduce) {
    .plan-day {
      animation: none;
      background-color: color-mix(in oklab, var(--color-cyan-400) 18%, transparent);
    }
  }
</style>
