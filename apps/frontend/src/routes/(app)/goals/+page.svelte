<script lang="ts">
  import { Screen, Skeleton } from "$lib/components";
  import { store } from "$lib/core/store.svelte";
  import { createGoal, removeGoal } from "$lib/goals/queries";
  import type { GoalDraft } from "$lib/goals/types";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { AppKeys, GoalRow, NewGoal } from "./components";

  /**
   * What is being kept, and the one thing to do next. The screen is quiet on purpose: progress is
   * not typed in here, it arrives from the apps where the thing is actually done, and this is
   * where it adds up to a streak and a rung on a ladder.
   */
  void store.goals.ensure();

  const board = $derived(store.goals.value);
  const goals = $derived(board?.goals ?? []);
  const next = $derived(goals.find((goal) => goal.id === board?.nextId) ?? null);

  async function create(draft: GoalDraft) {
    try {
      await createGoal(draft);
      await store.goals.refresh();
    } catch (e) {
      diagnostics.report("Goals", e, { title: "Couldn’t add that goal" });
      throw e;
    }
  }

  async function remove(id: string) {
    try {
      await removeGoal(id);
      await store.goals.refresh();
    } catch (e) {
      diagnostics.report("Goals", e, { title: "Couldn’t remove that goal" });
    }
  }
</script>

<Screen title="Goals">
  {#if !board}
    <div class="space-y-2">
      {#each [0, 1, 2] as row (row)}
        <Skeleton height={34} radius={6} />
      {/each}
    </div>
  {:else}
    <div class="space-y-10">
      {#if goals.length > 0}
        <section class="space-y-1">
          <p class="t-micro text-fg-faint">{next ? `Next up · ${next.title}` : "All kept"}</p>
          <p class="t-heading text-fg">{board.nudge}</p>
        </section>
      {/if}

      <section class="space-y-3">
        {#if goals.length > 0}
          <ul class="divide-y divide-line border-y border-line">
            {#each goals as goal (goal.id)}
              <GoalRow {goal} onremove={() => remove(goal.id)} />
            {/each}
          </ul>
        {:else}
          <p class="t-body text-fg-muted">
            Nothing is being kept yet. Name the first thing, and let the app where you do it report how it went.
          </p>
        {/if}
        <NewGoal oncreate={create} />
      </section>

      <AppKeys {goals} />
    </div>
  {/if}
</Screen>
