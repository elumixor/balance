<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button, Popover, PopoverItem, StarBurst, StarCount } from "$lib/components";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { BedDouble, LogOut, MoreHorizontal } from "lucide-svelte";

  /**
   * The strip the calendar wears while a day is being planned: a row above the grid rather than a
   * card over it, so no hour of the day is hidden behind the thing asking you to fill it.
   *
   * The meter *is* the button: it fills as blocks land on the lit day and unlocks when the day is
   * full enough to count. Two controls would mean deciding which one to press; one control that
   * changes state as you work means the filling is the game. The two quieter ways out — a rest
   * day, or leaving — sit behind one dot menu, because they are answers to a different question.
   *
   * It never says what is missing. "Two more hours" is a target; "you have not planned enough" is
   * a scolding, and people delete apps that scold them. And when it is done, the strip is the one
   * place the app gets loud.
   */
  const percent = $derived(Math.round(planMode.coverage * 100));
  const target = $derived(Math.round(planMode.threshold * 100));
  const awarded = $derived(planMode.awarded);
  const paid = $derived(awarded?.reduce((sum, award) => sum + award.delta, 0) ?? 0);

  const dayLabel = $derived.by(() => {
    if (!planMode.day) return "";
    const [year, month, day] = planMode.day.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  });

  const tenth = (value: number) => Math.round(value * 10) / 10;

  const buttonLabel = $derived.by(() => {
    if (planMode.ready) return "Finish";
    const left = tenth(planMode.remainingHours);
    return left > 0 ? `${left}h to go` : `Fill the day`;
  });

  function close() {
    planMode.stop();
    void goto("/calendar");
  }
</script>

{#if awarded}
  <!-- Paid. The grid goes quiet under it; the stars are the only thing moving. -->
  <div class="fade-in absolute inset-0 z-40 flex items-center justify-center bg-overlay p-6">
    <div class="float-in flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-(--shadow-float)">
      <StarBurst lit={Math.min(3, Math.max(1, paid))} of={3} size={40} />
      <p class="t-title"><StarCount value={paid} size={28} /></p>
      <p class="t-body text-fg-muted">{dayLabel} is decided. You get to wake up and just do it.</p>
      <Button full label="Done" onclick={close} />
    </div>
  </div>
{:else}
  <div class="shrink-0 border-b border-line bg-surface px-3 py-2 md:px-4">
    <div class="mx-auto flex max-w-3xl items-center gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between gap-2">
          <span class="t-label truncate">Planning {dayLabel}</span>
          <span class="t-data-micro flex shrink-0 items-center gap-2 text-fg-muted">
            <span>{tenth(planMode.mappedHours)}h of {tenth(planMode.budgetHours)}h</span>
            {#if planMode.stars > 0}
              <!-- What finishing pays, worn by the strip rather than spelled into the button. -->
              <StarCount value={planMode.stars} size={11} />
            {/if}
          </span>
        </div>
        <!-- The threshold is drawn on the meter rather than said in words: a line you can see
             yourself crossing is worth more than a number you have to remember. -->
        <div class="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-alt">
          <div
            class="h-full rounded-full transition-[width,background-color] duration-300 {planMode.ready ? 'bg-positive' : 'bg-ink'}"
            style="width:{Math.min(100, percent)}%"
          ></div>
          <div class="absolute inset-y-0 w-px bg-line-strong" style="left:{target}%"></div>
        </div>
      </div>

      <!-- Quiet until the day is full enough, then solid: the change of weight is the unlock. -->
      <Button
        size="sm"
        variant={planMode.ready ? "solid" : "outline"}
        label={buttonLabel}
        disabled={!planMode.ready}
        loading={planMode.committing}
        onclick={() => void planMode.finish()}
      />

      <Popover width={220}>
        {#snippet trigger(open)}
          <Button variant="bare" size="sm" title="More" onclick={open}>
            {#snippet icon()}<MoreHorizontal size={16} />{/snippet}
          </Button>
        {/snippet}
        {#snippet content(closeMenu)}
          <PopoverItem
            label="Make it a rest day"
            onclick={() => {
              closeMenu();
              void planMode.finish({ rest: true });
            }}
          >
            {#snippet icon()}<BedDouble size={14} />{/snippet}
          </PopoverItem>
          <PopoverItem
            label="Leave it for now"
            onclick={() => {
              closeMenu();
              close();
            }}
          >
            {#snippet icon()}<LogOut size={14} />{/snippet}
          </PopoverItem>
        {/snippet}
      </Popover>
    </div>
  </div>
{/if}
