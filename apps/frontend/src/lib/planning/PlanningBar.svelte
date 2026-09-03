<script lang="ts">
  import { goto } from "$app/navigation";
  import Button from "$lib/components/Button.svelte";
  import { planMode } from "./plan-mode.svelte";

  /**
   * The bar the calendar wears while a day is being planned.
   *
   * The meter *is* the button: it fills as blocks land on the lit day and unlocks when the day is
   * full enough to count. Two controls would mean deciding which one to press; one control that
   * changes state as you work means the filling is the game.
   *
   * It never says what is missing. "Two more hours" is a target; "you have not planned enough" is
   * a scolding, and people delete apps that scold them.
   */
  const percent = $derived(Math.round(planMode.coverage * 100));
  const target = $derived(Math.round(planMode.threshold * 100));
  const awarded = $derived(planMode.awarded);

  function label() {
    if (awarded) return "Done";
    if (planMode.ready) return `Finish planning · +${planMode.stars} ★`;
    const left = Math.round(planMode.remainingHours * 10) / 10;
    return left > 0 ? `${left}h more to unlock +${planMode.stars} ★` : `Fill the day to unlock +${planMode.stars} ★`;
  }

  function close() {
    planMode.stop();
    void goto("/calendar");
  }
</script>

<!-- Bottom on a phone where the thumb is, top on a desktop where the eye starts. -->
<div class="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 md:top-4 md:bottom-auto md:pb-0">
  <div
    class="pointer-events-auto mx-auto flex max-w-2xl flex-col gap-3 rounded-xl border border-line-strong bg-surface p-4 shadow-lg"
  >
    <div class="flex items-baseline justify-between gap-3">
      <span class="t-label">Planning {planMode.day}</span>
      <span class="t-micro tabular-nums text-fg-muted">
        {Math.round(planMode.mappedHours * 10) / 10}h of {Math.round(planMode.budgetHours * 10) / 10}h
      </span>
    </div>

    <!-- The threshold is drawn on the meter rather than said in words: a line you can see yourself
         crossing is worth more than a number you have to remember. -->
    <div class="relative h-2 overflow-hidden rounded-full bg-surface-alt">
      <div
        class="h-full rounded-full bg-ink transition-[width] duration-200"
        style="width:{Math.min(100, percent)}%"
      ></div>
      <div class="absolute inset-y-0 w-px bg-line-strong" style="left:{target}%"></div>
    </div>

    {#if awarded}
      <p class="t-body">
        {awarded.reduce((sum, award) => sum + award.delta, 0)} stars. Tomorrow is already decided —
        you get to wake up and just do it.
      </p>
      <Button full label="Done" onclick={close} />
    {:else}
      <Button
        full
        label={label()}
        disabled={!planMode.ready}
        loading={planMode.committing}
        onclick={() => void planMode.finish()}
      />
      <div class="flex items-center justify-between">
        <button type="button" class="t-micro text-fg-faint" onclick={close}>Leave it for now</button>
        <button type="button" class="t-micro text-fg-faint" onclick={() => void planMode.finish({ rest: true })}>
          Make it a rest day
        </button>
      </div>
    {/if}
  </div>
</div>
