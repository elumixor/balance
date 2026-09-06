<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { daysBetween } from "$lib/calendar/dates";
  import { Button } from "$lib/components";
  import { clock } from "$lib/platform/clock.svelte";
  import { LocateFixed } from "lucide-svelte";
  import { fade, fly } from "svelte/transition";

  /** The way back to today, floating over the grid only while today is off screen. */
  let {
    jumping,
  }: {
    /** True through the whole of a jump, so the button doesn't flicker back in mid-slide. */
    jumping: boolean;
  } = $props();

  const data = calendarData;

  /**
   * Whether today's column sits outside the days currently on screen. Measured against the
   * settled window rather than the live scroll: a fling crosses columns by the handful, and a
   * button that answered each one would blink through the whole gesture. It waits for the week to
   * land, which is also the only moment its answer can still be true a second later.
   */
  const todayOutOfView = $derived.by(() => {
    const todayDayIndex = daysBetween(data.stripStart, new Date(clock.todayStart));
    return todayDayIndex < data.dayOffset || todayDayIndex >= data.dayOffset + data.visibleDays;
  });
</script>

{#if todayOutOfView && !jumping}
  <div
    class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center"
    in:fly={{ y: 16, duration: 200 }}
    out:fly={{ y: 16, duration: 200 }}
  >
    <div class="pointer-events-auto" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
      <Button
        label="Today"
        size="sm"
        variant="danger"
        onclick={() => data.goToToday()}
        class="gap-1.5 rounded-full py-1.5 shadow-(--shadow-float)"
      >
        {#snippet icon()}
          <LocateFixed size={14} />
        {/snippet}
      </Button>
    </div>
  </div>
{/if}
