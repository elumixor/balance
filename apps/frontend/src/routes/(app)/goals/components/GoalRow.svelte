<script lang="ts">
  import { Button, ProgressBar } from "$lib/components";
  import type { Goal } from "$lib/goals/types";
  import { Flame } from "lucide-svelte";

  /**
   * One goal as it stands: how far this period has got, the rung it is on, and the run it is
   * keeping. Every number is the server's; nothing here is worked out twice.
   */
  let { goal, onremove }: { goal: Goal; onremove: () => Promise<void> } = $props();

  const weekly = $derived(goal.cadence === "weekly");
  const unit = $derived(goal.aggregate === "count" ? "" : ` ${goal.metric}`);
  const period = $derived(weekly ? "this week" : "today");
  const run = $derived(`${goal.streak.current} ${weekly ? "week" : "day"}${goal.streak.current === 1 ? "" : "s"} in a row`);
  const rung = $derived(
    goal.levels.length > 1 ? `Level ${goal.level + 1} of ${goal.levels.length}${goal.label ? `, ${goal.label}` : ""}` : null,
  );
  const stepUp = $derived.by(() => {
    const left = goal.next.advanceIn;
    if (left === null || left === 0) return null;
    const up = goal.levels[goal.level + 1]?.target;
    return `${left} more ${weekly ? "week" : "day"}${left === 1 ? "" : "s"} steps up to ${up}${unit}`;
  });

  /** Removing takes the history with it, so it is asked for twice. */
  let confirming = $state(false);
  let removing = $state(false);

  async function remove() {
    removing = true;
    try {
      await onremove();
    } finally {
      removing = false;
      confirming = false;
    }
  }
</script>

<li class="group space-y-2 py-4">
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="t-body-strong text-fg">{goal.title}</h2>
    <span
      class="t-label flex shrink-0 items-center gap-1 {goal.streak.current > 0 ? 'text-fg-muted' : 'text-fg-faint'}"
      title="Best so far: {goal.streak.best}"
    >
      <Flame size={13} strokeWidth={2.25} />
      {run}
    </span>
  </div>

  <ProgressBar
    ratio={Math.min(goal.period.value / goal.target, 1)}
    color={goal.period.met ? "var(--positive)" : "var(--ink)"}
  />

  <div class="flex items-center justify-between gap-3">
    <p class="t-label text-fg-muted">
      {goal.period.value} of {goal.target}{unit}
      {period}{#if rung}<span class="text-fg-faint"> · {rung}</span>{/if}{#if stepUp}<span class="text-fg-faint">
          · {stepUp}</span
        >{/if}
    </p>
    <div class="flex shrink-0 gap-2 {confirming ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}">
      {#if confirming}
        <Button label="Remove with its history" variant="danger" size="sm" loading={removing} onclick={() => void remove()} />
        <Button label="Keep" variant="outline" size="sm" onclick={() => (confirming = false)} />
      {:else}
        <Button label="Remove" variant="bare" size="sm" onclick={() => (confirming = true)} />
      {/if}
    </div>
  </div>
</li>
