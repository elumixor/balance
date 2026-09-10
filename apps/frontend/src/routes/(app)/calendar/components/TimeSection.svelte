<script lang="ts">
  import { CardRow, TimeField } from "$lib/components";
  import { preferences } from "$lib/account/preferences.svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import { describe, type Rule, toRRule } from "$lib/calendar/recurrence";
  import { offsetLabel, shiftZone } from "$lib/calendar/time-zones";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { deviceTimeZone } from "$lib/planning/zone";
  import { viewport } from "$lib/platform/viewport.svelte";
  import { formatClock, formatDayDate, parseDateAndClock } from "$lib/ui/format";
  import { ArrowRight, CalendarClock, Clock, Repeat } from "lucide-svelte";
  import type { Pickers } from "./EventEditor.svelte";
  import RepeatPicker from "./RepeatPicker.svelte";
  import TimeZonePicker from "./TimeZonePicker.svelte";

  /**
   * When it runs. The clock owns the whole block, so the date sits under the times it belongs
   * to, with the zone beside the one and the repeat rule beside the other.
   */
  let {
    event,
    draft,
    /** The rule this series repeats by, as every occurrence carries it. A one-off has none. */
    rule,
    /** Why the card is closed to edits, when there is somebody to name. */
    heldBy,
    pickers = $bindable(),
  }: {
    event: CalendarEvent;
    draft: EventDraft;
    rule: Rule | null;
    heldBy: string | null;
    pickers: Pickers;
  } = $props();

  const data = calendarData;
  const ICON = 14;
  const editable = $derived(draft.editable);

  const longDate = $derived(formatDayDate(new Date(event.start)));
  /** What the date field shows: the field it hides holds the same day in the format inputs take. */
  const dateLabel = $derived.by(() => {
    const at = parseDateAndClock(draft.date, "00:00");
    return at ? formatDayDate(at) : draft.date;
  });

  /** The zone the times are meant in: the event's own, or the device's where it never said. */
  const zone = $derived(event.timeZone ?? deviceTimeZone());
  /** By the name it was given here, or by its offset on the day. */
  const zoneLabel = $derived(preferences.zoneNamed(zone)?.label ?? offsetLabel(zone, new Date(event.start)));

  /** The wall clock stays; the instant moves. Nine in Prague put in Kyiv is nine in Kyiv. */
  function chooseZone(next: string) {
    pickers.zone = null;
    if (next === zone) return;
    draft.flush();
    const start = shiftZone(new Date(event.start), zone, next);
    const end = shiftZone(new Date(event.end), zone, next);
    void draft.write(
      "The time zone wasn’t saved",
      data.patchEvent(
        event,
        { timeZone: next, start: start.toISOString(), end: end.toISOString() },
        { timeZone: zone, start: event.start, end: event.end },
      ),
    );
  }

  /** "Weekly on Mon, Wed" with the "on" set back, so the days read and the joining word doesn't. */
  const repeatLabel = $derived.by(() => {
    if (!rule) return [{ text: event.seriesId ? "Repeats" : "Repeat", faint: false }];
    const [before, after] = describe(rule, new Date(event.start)).split(" on ");
    return after
      ? [
          { text: before, faint: false },
          { text: " on ", faint: true },
          { text: after, faint: false },
        ]
      : [{ text: before, faint: false }];
  });

  function chooseRule(next: Rule | null) {
    pickers.repeat = null;
    const lines = next ? [toRRule(next)] : [];
    const before = rule ? [toRRule(rule)] : [];
    if (lines.join() === before.join()) return;
    void draft.write("The repeat wasn’t saved", data.patchEvent(event, { recurrence: lines }, { recurrence: before }));
  }

  let dateEl = $state<HTMLInputElement | null>(null);
  /** The native date picker, opened from the words rather than a transparent field over them. */
  function openDatePicker() {
    try {
      dateEl?.showPicker();
    } catch {
      dateEl?.focus();
    }
  }
</script>

<div class="border-t border-line px-2 py-2">
  <CardRow icon={Clock} set>
    {#if editable}
      <TimeField
        bind:value={draft.from}
        counterpart={draft.to}
        oninput={() => draft.queue()}
        oncommit={() => draft.flush()}
        onpreview={(v) => (draft.previewFrom = v)}
        ariaLabel="Start time"
      />
      <ArrowRight size={ICON} class="shrink-0 text-fg-faint" />
      <TimeField
        bind:value={draft.to}
        counterpart={draft.from}
        end
        oninput={() => draft.queue()}
        oncommit={() => draft.flush()}
        onpreview={(v) => (draft.previewTo = v)}
        ariaLabel="End time"
      />
    {:else}
      <span class="t-label px-2">{event.allDay ? "All day" : `${formatClock(new Date(event.start))}`}</span>
      {#if !event.allDay}
        <ArrowRight size={ICON} class="shrink-0 text-fg-faint" />
        <span class="t-label px-2">{formatClock(new Date(event.end))}</span>
        <span class="t-label text-fg-faint">{draft.span}</span>
      {/if}
    {/if}
    {#if !event.allDay}
      <button
        type="button"
        disabled={!editable}
        aria-label="Time zone: {zoneLabel}"
        onclick={(e) => (pickers.zone = e.currentTarget.getBoundingClientRect())}
        class="field-bare press-sm t-label ml-auto shrink-0 text-fg-muted"
      >
        {zoneLabel}
      </button>
    {/if}
  </CardRow>

  <CardRow icon={CalendarClock} set>
    {#if editable && viewport.touch}
      <!-- A finger gets the platform's own date input: `showPicker` on a field nobody can see is
           a picker that never opens, which is a date that can't be changed at all. -->
      <input
        type="date"
        bind:value={draft.date}
        onchange={() => draft.queue()}
        aria-label="Date"
        class="field-bare t-label shrink-0"
      />
    {:else if editable}
      <!-- Reads as "Fri Aug 14"; the native picker behind it is what's actually being typed in. -->
      <button type="button" onclick={openDatePicker} class="field-bare press-sm t-label shrink-0">
        {dateLabel}
      </button>
      <input
        bind:this={dateEl}
        type="date"
        bind:value={draft.date}
        oninput={() => draft.queue()}
        aria-label="Date"
        tabindex="-1"
        class="pointer-events-none absolute size-0 opacity-0"
      />
    {:else}
      <span class="t-label px-2">{longDate}</span>
    {/if}
    {#if !event.allDay}
      <button
        type="button"
        disabled={!editable}
        onclick={(e) => (pickers.repeat = e.currentTarget.getBoundingClientRect())}
        class="field-bare press-sm flex min-w-0 items-center gap-2"
      >
        <Repeat size={ICON} class="shrink-0 {rule ? 'text-fg-muted' : 'text-fg-faint'}" />
        <span class="t-label truncate {rule ? 'text-fg' : 'text-fg-faint'}">
          {#each repeatLabel as part, i (i)}<span class={part.faint ? "text-fg-faint" : ""}>{part.text}</span>{/each}
        </span>
      </button>
    {/if}
  </CardRow>
  {#if heldBy}
    <p class="t-micro px-2 pt-1 text-fg-faint">Only {heldBy} can move this.</p>
  {/if}
</div>

{#if pickers.zone}
  <TimeZonePicker rect={pickers.zone} value={zone} at={new Date(event.start)} onchoose={chooseZone} onclose={() => (pickers.zone = null)} />
{/if}

{#if pickers.repeat}
  <RepeatPicker rect={pickers.repeat} value={rule} day={new Date(event.start)} onchoose={chooseRule} onclose={() => (pickers.repeat = null)} />
{/if}
