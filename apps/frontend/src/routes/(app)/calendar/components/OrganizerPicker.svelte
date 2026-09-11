<script lang="ts">
  import { Popover, Spinner } from "$lib/components";
  import type { CalendarRef } from "$lib/calendar/types";
  import { store } from "$lib/core/store.svelte";
  import { restColor } from "$lib/ui/colors";
  import { Check, ChevronDown } from "lucide-svelte";

  /**
   * Who hosts the event, as a choice rather than a fact. An event is organized by the calendar it
   * was written in, so changing the organizer is choosing another calendar — grouped by the
   * account each belongs to, since "which of my addresses is this from" is the real question and
   * two accounts can each have a calendar called Work.
   *
   * A calendar the account can only read can't host anything, so it is listed but not offered.
   */
  let {
    calendarId,
    label,
    onchoose,
  }: {
    /** The event's own calendar, qualified with its account — what the tick is beside. */
    calendarId: string;
    /** The organizer's name as the guest list draws it, which is the trigger. */
    label: string;
    onchoose: (calendarId: string) => void;
  } = $props();

  const prefs = store.calendars;
  const accounts = $derived(prefs.value?.accounts ?? []);

  // Asked for when the card is opened rather than when the panel is: the panel has to be able to
  // draw its list on the frame it appears, or it would measure itself empty and place itself wrong.
  $effect(() => void prefs.ensure());

  function choose(calendar: CalendarRef, close: () => void) {
    close();
    if (calendar.id !== calendarId) onchoose(calendar.id);
  }
</script>

<Popover width={260} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      aria-label="Change who organizes this event"
      class="press-sm flex min-w-0 items-center gap-1 rounded text-left hover:text-fg"
    >
      <span class="t-label min-w-0 truncate">{label}</span>
      <ChevronDown size={11} class="shrink-0 text-fg-faint" />
    </button>
  {/snippet}
  {#snippet content(close)}
    {#if accounts.length === 0}
      <div class="flex items-center gap-2 px-3 py-2.5 text-fg-faint" aria-busy="true">
        <Spinner size={14} />
        <span class="t-micro">Loading calendars…</span>
      </div>
    {:else}
      {#each accounts as account (account.accountId)}
        <div class="t-micro truncate px-3 pt-2 pb-1 text-fg-faint">
          {account.email ?? "Unknown account"}{account.needsReconnect ? " — reconnect" : ""}
        </div>
        {#each account.calendars as calendar (calendar.id)}
          {@const current = calendar.id === calendarId}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={current}
            disabled={calendar.readOnly && !current}
            onclick={() => choose(calendar, close)}
            class="t-label flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-alt
              disabled:cursor-default disabled:text-fg-faint"
          >
            <span class="flex size-3 shrink-0 items-center justify-center">
              {#if current}<Check size={12} />{/if}
            </span>
            <span class="size-2.5 shrink-0 rounded-sm" style="background:{calendar.color ?? restColor}"></span>
            <span class="min-w-0 flex-1 truncate">{calendar.name}</span>
          </button>
        {/each}
      {/each}
    {/if}
  {/snippet}
</Popover>
