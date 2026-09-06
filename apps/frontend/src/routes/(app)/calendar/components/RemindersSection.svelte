<script lang="ts">
  import { CardRow, Popover, PopoverItem } from "$lib/components";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import type { CalendarEvent, EventReminder, EventTimer } from "$lib/calendar/types";
  import { Timer } from "lucide-svelte";
  import RemindersRow from "./RemindersRow.svelte";

  /** How you'll be told: the calendar's own reminders, and the rhythm a timer runs at. */
  let {
    event,
    draft,
    /**
     * Reminders live on your own copy of an event, so an invitation you can't move still takes
     * them — only a calendar you can't write to at all refuses.
     */
    remindable,
    /** Whether the timer row is drawn: not folded away, and the block counts as something. */
    withTimer,
  }: {
    event: CalendarEvent;
    draft: EventDraft;
    remindable: boolean;
    withTimer: boolean;
  } = $props();

  const data = calendarData;
  const TIMER_MENU_WIDTH = 200;

  function chooseReminders(reminders: EventReminder[]) {
    void draft.write("The reminders weren’t saved", data.patchEvent(event, { reminders }, { reminders: event.reminders }));
  }

  /**
   * How a timer run for this block is broken up. The length is the block's own, so the only choice
   * is the rhythm — and it rides on the mapping, so a block that counts as nothing has nowhere to
   * keep it, which is why the row only shows once there is a category.
   */
  const TIMERS: { value: string; label: string; timer: EventTimer | null }[] = [
    { value: "", label: "Runs to the end", timer: null },
    ...[5, 10, 15, 25, 30].map((minutes) => ({
      value: `every:${minutes}`,
      label: `Nudge every ${minutes} min`,
      timer: { kind: "every", minutes } as const,
    })),
    ...[2, 3, 4, 5].map((count) => ({
      value: `parts:${count}`,
      label: `Split in ${count}`,
      timer: { kind: "parts", count } as const,
    })),
  ];
  const timerKey = $derived(
    event.timer ? (event.timer.kind === "every" ? `every:${event.timer.minutes}` : `parts:${event.timer.count}`) : "",
  );
  const timerLabel = $derived(TIMERS.find((t) => t.value === timerKey)?.label ?? "Timer");

  function chooseTimer(value: string) {
    const timer = TIMERS.find((t) => t.value === value)?.timer ?? null;
    void draft.write("The timer wasn’t saved", data.tagEvent(event, { timer }));
  }
</script>

<div class="border-t border-line px-2 py-1.5">
  <RemindersRow reminders={event.reminders} editable={remindable} onchange={chooseReminders} />
  {#if withTimer}
    <Popover width={TIMER_MENU_WIDTH} align="start">
      {#snippet trigger(open)}
        <CardRow icon={Timer} label={event.timer ? timerLabel : "Set up timer"} set={Boolean(event.timer)} onclick={open} />
      {/snippet}
      {#snippet content(close)}
        {#each TIMERS as option (option.value)}
          <PopoverItem
            label={option.label}
            selected={option.value === timerKey}
            onclick={() => {
              chooseTimer(option.value);
              close();
            }}
          />
        {/each}
      {/snippet}
    </Popover>
  {/if}
</div>
