<script lang="ts">
  import AnchoredPopup from "$lib/components/AnchoredPopup.svelte";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import { restColor } from "$lib/colors";
  import { formatClock, formatDateInput, formatDayDate, formatHoursAndMinutes, parseDateAndClock } from "$lib/format";
  import { DEFAULT_ICON } from "$lib/icons";
  import type { CalendarEvent, Category, MappingScope } from "$lib/types";
  import { ArrowRight, Bell, Clock, Link2, MapPin, Trash2, Video, X } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";
  import CategoryPicker from "./CategoryPicker.svelte";
  import TimeField from "./TimeField.svelte";

  /**
   * One event, opened beside the block you tapped: what it says, when it runs, and what it counts
   * as. Nothing here has a Save button — every edit is written back a moment after the typing
   * stops, the way a calendar is expected to behave.
   */
  let {
    event,
    rect,
    categories,
  }: {
    event: CalendarEvent;
    rect: DOMRect | null;
    categories: readonly Category[];
  } = $props();

  const WIDTH = 380;
  /** How long after the last keystroke the edit goes to the calendar. */
  const SAVE_DELAY_MS = 700;

  const data = calendarData;
  const plannable = $derived(categories.filter((c) => !c.archived));
  const editable = $derived(!event.readOnly && !event.allDay);

  // A repeating event always counts as the same thing on every occurrence — only a one-off event
  // gets an instance-scoped mapping.
  const scope: MappingScope = $derived(event.seriesId ? "series" : "instance");
  // Every field below is filled in by the effect that loads the event, including the first one.
  let title = $state("");
  let notes = $state("");
  let date = $state("");
  let from = $state("");
  let to = $state("");
  let error = $state<string | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** What the calendar last agreed to, so an unchanged field never costs a write. */
  let saved = { title: "", notes: "", start: 0, end: 0 };
  let loaded = "";
  /** A deleted event must not be written back by the pending edit the card is unmounting with. */
  let deleted = false;
  let titleEl = $state<HTMLInputElement | null>(null);
  /** Whether the cursor has already been put in the name of the block on show — see below. */
  let focused = false;

  // Selecting another block while this one is open swaps the prop rather than remounting.
  $effect(() => {
    if (loaded === event.id) return;
    // A draft the calendar has just given a real id to is the same block, still being typed into:
    // reloading it here would put the server's version of a half-typed name back.
    const carriedOver = data.becameId(loaded) === event.id;
    loaded = event.id;
    if (carriedOver) return;
    focused = false;
    pickerRect = null;
    previewFrom = null;
    previewTo = null;
    title = event.title;
    notes = event.description ?? "";
    date = formatDateInput(new Date(event.start));
    from = formatClock(new Date(event.start));
    to = formatClock(new Date(event.end));
    error = null;
    saved = {
      title: event.title,
      notes: event.description ?? "",
      start: new Date(event.start).getTime(),
      end: new Date(event.end).getTime(),
    };
  });

  /**
   * A block tapped onto the grid arrives unnamed, and naming it is the only reason its editor is
   * open — so the cursor is in the name already, over whatever's there. Once per event: the card
   * is rebuilt when the calendar gives the block its real id, and that must not take the cursor
   * away from wherever it's got to by then, nor select what's been typed since.
   */
  $effect(() => {
    const input = titleEl;
    if (!input || data.unnamedId !== event.id || focused) return;
    focused = true;
    // Next frame: the card is hidden until it knows where it belongs, and nothing inside something
    // hidden can take focus.
    const frame = requestAnimationFrame(() => {
      input.focus();
      if (title) input.setSelectionRange(title.length, title.length);
      else input.select();
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Set to the row's rect while the category list is open, null otherwise. */
  let pickerRect = $state<DOMRect | null>(null);

  /**
   * A block counts as one category here: whichever it mostly counts toward, if it's split. Looked
   * up across every category rather than the pickable ones, so a block already counting as a
   * buffer or an archived category still shows what it is.
   */
  const category = $derived.by(() => {
    const ranked = event.weights
      .map((w) => ({ weight: w.weightPercent, category: categories.find((c) => c.id === w.categoryId) }))
      .filter((w) => w.category)
      .sort((a, b) => b.weight - a.weight);
    return ranked[0]?.category ?? null;
  });

  /** The span the two clock fields describe, shown beside them the way the calendar shows it. */
  const span = $derived.by(() => {
    const range = parseRange();
    if (!range) return "";
    return formatHoursAndMinutes((range.end.getTime() - range.start.getTime()) / 3_600_000);
  });

  const longDate = $derived(formatDayDate(new Date(event.start)));
  /** What the date field shows: the field it hides holds the same day in the format inputs take. */
  const dateLabel = $derived.by(() => {
    const at = parseDateAndClock(date, "00:00");
    return at ? formatDayDate(at) : date;
  });

  /** A pending edit still belongs to the user, so it's written before the card goes away. */
  $effect(() => () => flush());

  /**
   * What a time field is currently pointing at, while it's being used — the block on the grid is
   * drawn at that size before anything is written, so a walked-to suggestion can be seen as well
   * as read. Null the rest of the time, which leaves the grid to say what the week holds.
   */
  let previewFrom = $state<string | null>(null);
  let previewTo = $state<string | null>(null);

  $effect(() => {
    const range = previewFrom || previewTo ? parseRange(previewFrom ?? from, previewTo ?? to) : null;
    const next = range ? { id: event.id, start: range.start.toISOString(), end: range.end.toISOString() } : null;
    // Written only when it actually says something else: the preview changes the event this card
    // is showing, which would otherwise hand the effect its own answer back forever.
    const now = data.preview;
    if (now?.id !== next?.id || now?.start !== next?.start || now?.end !== next?.end) data.preview = next;
  });

  /** Nothing is being decided once the card is gone, so nothing is drawn ahead of the week either. */
  $effect(() => () => (data.preview = null));

  function parseRange(fromClock = from, toClock = to) {
    const start = parseDateAndClock(date, fromClock);
    let end = parseDateAndClock(date, toClock);
    if (!start || !end) return null;
    // A block that ends before it starts ran past midnight.
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  function queue() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void commit(), SAVE_DELAY_MS);
  }

  function flush() {
    if (!timer || deleted) return;
    clearTimeout(timer);
    timer = null;
    void commit();
  }

  /** Writes only what actually moved; an unparseable time is said once and left alone. */
  async function commit() {
    timer = null;
    if (!editable) return;
    const range = parseRange();
    if (!range) {
      error = "Check the date and times.";
      return;
    }
    const next = { title: title.trim(), notes, start: range.start.getTime(), end: range.end.getTime() };
    if (next.title === saved.title && next.notes === saved.notes && next.start === saved.start && next.end === saved.end) {
      error = null;
      return;
    }

    // The write draws itself on the grid before it asks the server, so nothing here waits on the
    // network to look done — only the error, if one comes back, arrives late.
    saved = next;
    error = null;
    await data.editEvent(event, {
      title: next.title,
      description: next.notes,
      start: range.start,
      end: range.end,
    });
    error = data.actionError;
  }

  /** Mapping writes land straight away — there's nothing to type, so there's nothing to wait for. */
  async function run(action: () => Promise<void>) {
    error = null;
    await action();
    error = data.actionError;
  }

  /**
   * One category, whole: a split across several is a thing the week screen sets, not this card.
   * With other blocks gathered, the choice applies to the whole batch rather than just this one.
   */
  function chooseCategory(categoryId: string) {
    pickerRect = null;
    const weights = [{ categoryId, weightPercent: 100 }];
    if (data.picked.size > 0) {
      void run(() => data.mapEvents(data.pickedEvents, weights));
      data.clearPicked();
      return;
    }
    void run(() => data.mapEvent(event, scope, { weights }));
  }

  function close() {
    flush();
    data.deselect();
  }

  // Enter commits from any single-line field; the notes get their own newlines.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && editable && !(e.target instanceof HTMLTextAreaElement)) flush();
  }
</script>

<svelte:window {onkeydown} />

{#snippet row(label: string, icon: typeof MapPin)}
  {@const Icon = icon}
  <!-- The rows Notion fills in for a meeting: drawn, inert, waiting on a backend. -->
  <button type="button" class="press-sm flex w-full items-center gap-3 rounded-md py-1.5 text-left" disabled>
    <Icon size={16} class="shrink-0 text-fg-faint" />
    <span class="t-body text-fg-faint">{label}</span>
  </button>
{/snippet}

<AnchoredPopup {rect} width={WIDTH} dismiss={!pickerRect} onclose={close}>
    <!-- Header: what it counts as and what it's called, beside the two things you can do to it. -->
    <div class="flex items-center gap-1 px-3 py-3">
      <!-- The same badge the block on the grid wears, opening the same list. -->
      <button
        type="button"
        aria-label="Change category"
        class="press-sm shrink-0 rounded-md"
        onclick={(e) => (pickerRect = e.currentTarget.getBoundingClientRect())}
      >
        <CategoryIcon icon={category?.icon ?? DEFAULT_ICON} color={category?.color ?? restColor} size={28} />
      </button>
      {#if editable}
        <Field
          bind:value={title}
          bind:element={titleEl}
          oninput={queue}
          placeholder="Untitled"
          variant="inline"
          ariaLabel="Event title"
          class="t-heading py-1"
        />
      {:else}
        <h2 class="t-heading flex-1 truncate px-2 py-1">{event.title}</h2>
      {/if}
      {#if editable}
        <IconButton
          label="Delete event"
          tone="plain"
          onclick={() => {
            deleted = true;
            if (timer) clearTimeout(timer);
            void run(() => data.deleteEvent(event));
          }}
        >
          <Trash2 size={15} class="text-fg-muted" />
        </IconButton>
      {/if}
      <IconButton label="Close" tone="plain" onclick={close}>
        <X size={16} class="text-fg-muted" />
      </IconButton>
    </div>

    {#if error}<div class="px-3 pb-3"><InlineError message={error} /></div>{/if}

    <!-- When it runs. The clock owns the whole block, so the date sits under the times it belongs to. -->
    <div class="space-y-1 border-t border-line px-3 py-3">
      <div class="flex items-center gap-3">
        <Clock size={16} class="shrink-0 text-fg-faint" />
        {#if editable}
          <TimeField
            bind:value={from}
            counterpart={to}
            oninput={queue}
            oncommit={flush}
            onpreview={(v) => (previewFrom = v)}
            ariaLabel="Start time"
          />
          <ArrowRight size={14} class="shrink-0 text-fg-faint" />
          <TimeField
            bind:value={to}
            counterpart={from}
            end
            oninput={queue}
            oncommit={flush}
            onpreview={(v) => (previewTo = v)}
            ariaLabel="End time"
          />
        {:else}
          <span class="font-sans text-[14px] leading-[19px] tabular-nums">{event.allDay ? "All day" : `${formatClock(new Date(event.start))}`}</span>
          {#if !event.allDay}
            <ArrowRight size={14} class="shrink-0 text-fg-faint" />
            <span class="font-sans text-[14px] leading-[19px] tabular-nums">{formatClock(new Date(event.end))}</span>
          {/if}
          <span class="t-data-micro text-fg-muted">{span}</span>
        {/if}
      </div>

      <div class="flex items-center gap-3 pl-7">
        {#if editable}
          <!-- Reads as "Fri Aug 14"; the native picker behind it is what's actually being typed in. -->
          <label
            class="relative flex h-9 items-center rounded-md border border-transparent px-2 transition-colors
              hover:border-line focus-within:border-line-strong focus-within:ring-2 focus-within:ring-fg/10"
          >
            <span class="font-sans text-[14px] leading-[19px] tabular-nums">{dateLabel}</span>
            <input
              type="date"
              bind:value={date}
              oninput={queue}
              aria-label="Date"
              class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        {:else}
          <span class="font-sans text-[14px] leading-[19px] tabular-nums px-2">{longDate}</span>
        {/if}
      </div>

      <div class="flex items-center gap-4 pl-9">
        <button type="button" class="t-label text-fg-faint" disabled>All-day</button>
        <button type="button" class="t-label text-fg-faint" disabled>Time zone</button>
        <button type="button" class="t-label text-fg-faint" disabled>Repeat</button>
      </div>
    </div>

    <!-- Everything a calendar event can carry that this app doesn't hold yet. -->
    <div class="border-t border-line px-3 py-2">
      {@render row("Conferencing", Video)}
      {@render row("Location", MapPin)}
    </div>

    <div class="border-t border-line px-3 py-2">
      {@render row("Add links and attachments", Link2)}
    </div>

    <div class="border-t border-line px-3 py-2">
      {#if editable}
        <Textarea
          bind:value={notes}
          oninput={queue}
          rows={2}
          placeholder="Description"
          ariaLabel="Event notes"
          class="bg-transparent px-0"
        />
      {:else if event.description}
        <p class="t-body whitespace-pre-wrap text-fg-muted">{event.description}</p>
      {:else}
        <p class="t-body text-fg-faint">Description</p>
      {/if}
    </div>

    {#if !event.countsTowardHours}
      <p class="t-micro border-t border-line px-3 py-2 text-fg-faint">
        {event.declined ? "You declined this, so it counts toward nothing." : "All-day events don't count as hours."}
      </p>
    {/if}

    <div class="border-t border-line px-3 py-3">
      <div class="flex items-center gap-3 py-1">
        <Bell size={16} class="shrink-0 text-fg-faint" />
        <span class="t-body text-fg-faint">Reminders</span>
      </div>
    </div>
</AnchoredPopup>

{#if pickerRect}
  <CategoryPicker
    rect={pickerRect}
    categories={plannable}
    value={category?.id ?? ""}
    onchoose={chooseCategory}
    onclose={() => (pickerRect = null)}
  />
{/if}
