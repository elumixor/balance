<script lang="ts">
  import { AnchoredPopup, CardRow, CategoryIcon, CategoryPicker, Field, Popover, PopoverItem, Textarea } from "$lib/components";
  import { restColor } from "$lib/colors";
  import { openExternal } from "$lib/desktop/open";
  import { diagnostics } from "$lib/diagnostics.svelte";
  import { formatClock, formatDateInput, formatDayDate, formatHoursAndMinutes, parseDateAndClock } from "$lib/format";
  import { DEFAULT_ICON } from "$lib/icons";
  import { FEEDS, integrations } from "$lib/integrations/integrations.svelte";
  import { asGoogleAccount, hasAddress, meetingOf, partsOf } from "$lib/meeting";
  import { deviceTimeZone } from "$lib/planning/zone";
  import { preferences } from "$lib/preferences.svelte";
  import ProjectPicker from "./ProjectPicker.svelte";
  import { practices, projects, tasks } from "$lib/synced.svelte";
  import { offsetLabel, shiftZone } from "$lib/time-zones";
  import type { CalendarEvent, Category, EventReminder, EventTimer, MappingScope } from "$lib/types";
  import {
    AlignLeft,
    ArrowRight,
    CalendarClock,
    Check,
    Clock,
    Copy,
    FolderKanban,
    HelpCircle,
    Repeat,
    Sparkles,
    Timer,
    Trash2,
    Users,
    Video,
    MapPin,
    X,
  } from "lucide-svelte";
  import { accountEmailOf, type Answer, calendarData } from "$lib/calendar/calendar-data.svelte";
  import CardSettings, { type CardSection } from "./CardSettings.svelte";
  import ConferencingRow from "./ConferencingRow.svelte";
  import LocationRow from "./LocationRow.svelte";
  import ParticipantsRow from "./ParticipantsRow.svelte";
  import { describe, fromRecurrence, NEVER, type Rule, toRRule } from "$lib/calendar/recurrence";
  import RemindersRow from "./RemindersRow.svelte";
  import RepeatPicker from "./RepeatPicker.svelte";
  import TimeField from "./TimeField.svelte";
  import TimeZonePicker from "./TimeZonePicker.svelte";

  /**
   * One event, opened beside the block you tapped: what it says, when it runs, what it counts as,
   * and everything the meeting inside it carries. Nothing here has a Save button — every edit is
   * written back a moment after the typing stops, the way a calendar is expected to behave.
   *
   * The card is sections, top to bottom in the order they are asked about: the name and what it
   * is for; when; how you'll be told; where and with whom; what it says. Any section that is
   * rarely filled in can be folded away from the popover at the foot, and stays folded on every
   * card, because the person who never sets a timer never wants the row.
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
  /** The quiet buttons on the top line, in the same type as the project beside them. */
  const ACTION = "press-sm shrink-0 rounded p-1 text-fg-faint hover:text-fg";
  /** How long after the last keystroke the edit goes to the calendar. */
  const SAVE_DELAY_MS = 700;

  /** The sections that can be folded away, in card order. Time and reminders are always drawn. */
  const SECTIONS: readonly CardSection[] = [
    { id: "project", label: "Project", icon: FolderKanban },
    { id: "timer", label: "Timer", icon: Timer },
    { id: "conferencing", label: "Conferencing", icon: Video },
    { id: "participants", label: "Participants", icon: Users },
    { id: "location", label: "Location", icon: MapPin },
    { id: "description", label: "Description", icon: AlignLeft },
  ];

  const data = calendarData;
  const plannable = $derived(categories);
  const editable = $derived(event.movable && !event.allDay);
  /**
   * Reminders live on your own copy of an event, so an invitation you can't move still takes
   * them — only a calendar you can't write to at all refuses.
   */
  const remindable = $derived(!event.readOnly && !event.allDay);
  /** Why the card is closed to edits, when there is somebody to name. */
  const heldBy = $derived(
    !event.movable && !event.readOnly && event.organizer && !event.organizer.self
      ? (event.organizer.name ?? event.organizer.email ?? "the organizer")
      : null,
  );
  /** What this card folds away: its own list once it has one, the account's default until then. */
  const hidden = $derived(event.hidden ?? preferences.hiddenSections);
  const shown = $derived.by(() => {
    const set = new Set(hidden);
    return (id: string) => !set.has(id);
  });
  function toggleSection(id: string, show: boolean) {
    const next = new Set(hidden);
    if (show) next.delete(id);
    else next.add(id);
    void data.tagEvent(event, { hidden: [...next] });
  }

  // A repeating event always counts as the same thing on every occurrence — only a one-off event
  // gets an instance-scoped mapping.
  const scope: MappingScope = $derived(event.seriesId ? "series" : "instance");
  // Every field below is filled in by the effect that loads the event, including the first one.
  let title = $state("");
  let notes = $state("");
  let date = $state("");
  let from = $state("");
  let to = $state("");

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
    projectRect = null;
    zoneRect = null;
    repeatRect = null;
    detaching = false;
    previewFrom = null;
    previewTo = null;
    title = event.title;
    notes = event.description ?? "";
    date = formatDateInput(new Date(event.start));
    from = formatClock(new Date(event.start));
    to = formatClock(new Date(event.end));
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
  /** The same for the list of projects, the zones, and the repeat rules. */
  let projectRect = $state<DOMRect | null>(null);
  let zoneRect = $state<DOMRect | null>(null);
  let repeatRect = $state<DOMRect | null>(null);
  const nested = $derived(Boolean(pickerRect || projectRect || zoneRect || repeatRect));

  // --- what it is for ------------------------------------------------------------------------

  /** "Project / task", by name — the tag is the id, the card says the thing. */
  const purpose = $derived.by(() => {
    const task = event.taskId ? tasks.all.find((t) => t.id === event.taskId) : null;
    if (event.projectId) {
      const project = projects.all.find((p) => p.id === event.projectId)?.name ?? "A project";
      return task ? `${project} / ${task.title}` : project;
    }
    if (event.practiceId) return practices.all.find((p) => p.id === event.practiceId)?.name ?? "A practice";
    return null;
  });
  const purposeKey = $derived(
    event.projectId ? `project:${event.projectId}` : event.practiceId ? `practice:${event.practiceId}` : "",
  );
  /** Whether the cross on the pill has been pressed once and is waiting to be meant. */
  let detaching = $state(false);

  function choosePurpose(next: { projectId: string | null; practiceId: string | null }) {
    projectRect = null;
    void data.tagEvent(event, next);
  }

  function detach() {
    detaching = false;
    void data.tagEvent(event, { projectId: null, practiceId: null, taskId: null });
  }

  // --- what it counts as ---------------------------------------------------------------------

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

  /**
   * One category, whole: a split across several is a thing the week screen sets, not this card.
   * With other blocks gathered, the choice applies to the whole batch rather than just this one.
   */
  function chooseCategory(categoryId: string) {
    pickerRect = null;
    const weights = [{ categoryId, weightPercent: 100 }];
    if (data.picked.size > 0) {
      void data.mapEvents(data.pickedEvents, weights);
      data.clearPicked();
      return;
    }
    void data.mapEvent(event, scope, { weights });
  }

  // --- when ----------------------------------------------------------------------------------

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

  /** The zone the times are meant in: the event's own, or the device's where it never said. */
  const zone = $derived(event.timeZone ?? deviceTimeZone());
  /** By the name it was given here, or by its offset on the day. */
  const zoneLabel = $derived(preferences.zoneNamed(zone)?.label ?? offsetLabel(zone, new Date(event.start)));

  /** The wall clock stays; the instant moves. Nine in Prague put in Kyiv is nine in Kyiv. */
  function chooseZone(next: string) {
    zoneRect = null;
    if (next === zone) return;
    flush();
    const start = shiftZone(new Date(event.start), zone, next);
    const end = shiftZone(new Date(event.end), zone, next);
    void data.patchEvent(
      event,
      { timeZone: next, start: start.toISOString(), end: end.toISOString() },
      { timeZone: zone, start: event.start, end: event.end },
    );
  }

  /** The rule this series repeats by, as every occurrence carries it. A one-off has none. */
  const rule = $derived(fromRecurrence(event.recurrence));
  /** "Weekly on Mon, Wed" with the "on" set back, so the days read and the joining word doesn't. */
  const repeatLabel = $derived.by(() => {
    if (!rule) return [{ text: event.seriesId ? "Repeats" : "Repeat", faint: false }];
    const [before, after] = describe(rule, new Date(event.start)).split(" on ");
    return after ? [{ text: before, faint: false }, { text: " on ", faint: true }, { text: after, faint: false }] : [{ text: before, faint: false }];
  });

  function chooseRule(next: Rule | null) {
    repeatRect = null;
    const lines = next ? [toRRule(next)] : [];
    const before = rule ? [toRRule(rule)] : [];
    if (lines.join() === before.join()) return;
    void data.patchEvent(event, { recurrence: lines }, { recurrence: before });
  }

  // --- how you'll be told --------------------------------------------------------------------

  function chooseReminders(reminders: EventReminder[]) {
    void data.patchEvent(event, { reminders }, { reminders: event.reminders });
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
    void data.tagEvent(event, { timer });
  }

  // --- where, and with whom ------------------------------------------------------------------

  /** Where the meeting is and how you get into it, read the same way the reminder card reads it. */
  const meeting = $derived(meetingOf(event));
  /** The notes as words and pills, each link drawn where it was written. */
  const parts = $derived(partsOf(event.description ?? ""));
  /**
   * Links the notes don't spell out — the conferencing block's, one in the location — still get
   * a pill, after the words, so the description is the one place a link is copied from.
   */
  const extraLinks = $derived.by(() => {
    const written = new Set(parts.flatMap((part) => ("link" in part ? [part.link.url] : [])));
    const all = meeting.join ? [{ url: meeting.join.url, label: meeting.join.label }, ...meeting.links] : meeting.links;
    return all.filter((link) => !written.has(link.url));
  });
  /** Whose calendar this came from: what tells a Google link which signed-in account to open as. */
  const accountEmail = $derived(accountEmailOf(event.calendarId));
  /** The link the Join button actually opens, pointed at the account that was invited. */
  const joinUrl = $derived(meeting.join ? asGoogleAccount(meeting.join.url, accountEmail) : null);
  /**
   * The address travel times are worked out to, or null. A room name or a link is nowhere to
   * travel to. Where the journey *starts* is the picker's business — it can always answer, if
   * only with the device's own position, so it is offered wherever there is an address.
   */
  const travelTo = $derived(hasAddress(event) ? meeting.location : null);
  /** A guest list is the organizer's to keep; an invitation you received isn't yours to change. */
  const hosting = $derived(editable && (!event.organizer || event.organizer.self));

  function chooseLocation(location: string) {
    void data.patchEvent(event, { location }, { location: event.location ?? "" });
  }

  function chooseGuests(attendees: { email: string; optional?: boolean }[]) {
    const before = event.attendees.flatMap((a) => (a.email ? [{ email: a.email, optional: a.optional }] : []));
    void data.patchEvent(event, { attendees }, { attendees: before });
  }

  function addCall() {
    void data.patchEvent(event, { conference: "create" }, { conference: "remove" });
  }

  function removeCall() {
    void data.patchEvent(event, { conference: "remove" }, { conference: "create" });
  }

  /** A link to somebody else's call goes where the card already reads links from: the notes. */
  function pasteCall(url: string) {
    notes = notes.trim() ? `${notes.trimEnd()}\n\n${url}` : url;
    queue();
    flush();
  }

  const RSVP: { value: Answer; label: string; icon: typeof Check }[] = [
    { value: "accepted", label: "Yes", icon: Check },
    { value: "tentative", label: "Maybe", icon: HelpCircle },
    { value: "declined", label: "No", icon: X },
  ];
  /** The answer on the card: what was said, or the question while nothing has been. */
  const said = $derived(RSVP.find((c) => c.value === event.response) ?? RSVP[1]);
  /**
   * The chip sits on the card's right edge, and the card clips what leaves it, so the choices
   * have to open leftward — with the answer already given kept last, exactly where it rested.
   */
  const choices = $derived([...RSVP.filter((c) => c !== said), said]);
  /**
   * An all-day invitation is still an invitation, so this isn't `editable` — but a calendar you
   * only have read access to won't take an answer either, and offering one would only fail.
   */
  const answerable = $derived(event.invited && !event.readOnly);

  /**
   * Answering an invitation isn't an edit, so it doesn't go through the debounce — it's drawn and
   * queued the way every other write is, and ⌘Z takes it back like one.
   */
  function respond(response: Answer) {
    void data.respondToEvent(event, response);
  }

  // --- what feeds it -------------------------------------------------------------------------

  /** The feed this block is linked to, and the integration it belongs to — for the card's section. */
  const linked = $derived(event.source ? (FEEDS.get(event.source) ?? null) : null);

  /**
   * Linking rides on the mapping, so a block that counts as nothing is first made to count as
   * something: the category named for the feed if there is one — "Sleep" — and the buffer
   * otherwise, the same place an hour nobody planned already lands. Either is one tap to change.
   * On the phone that can read the feed, the link also asks for permission and reads straight
   * away; anywhere else the link is made and the record arrives from the phone.
   */
  async function link(source: string) {
    const entry = FEEDS.get(source);
    if (!entry) return;
    // A feed records every night, so a one-off block is first made a daily series, and the link
    // lands on the series: the block becomes its master, and every occurrence carries the feed.
    let target = event;
    let targetScope = scope;
    if (!event.seriesId && !rule) {
      const lines = [toRRule({ frequency: "daily", interval: 1, weekdays: [], end: NEVER })];
      await data.patchEvent(event, { recurrence: lines }, { recurrence: [] });
      target = { ...event, seriesId: event.id, recurrence: lines };
      targetScope = "series";
    }
    if (!category) {
      const word = entry.feed.label.toLowerCase();
      const guess = plannable.find((c) => c.name.toLowerCase().includes(word)) ?? plannable.find((c) => c.isBuffer);
      if (!guess) return;
      await data.mapEvent(target, targetScope, { weights: [{ categoryId: guess.id, weightPercent: 100 }] }, {
        ...{ projectId: event.projectId, practiceId: event.practiceId, taskId: event.taskId, timer: event.timer, hidden: event.hidden },
        source,
      });
    } else {
      await data.tagEvent(target, { source });
    }
    if (entry.integration.available) void integrations.sync(entry.integration, entry.feed);
  }

  function unlink() {
    void data.tagEvent(event, { source: null });
  }

  // --- writing -------------------------------------------------------------------------------

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
      diagnostics.report("Event", "Check the date and times.", { title: "Check the date and times" });
      return;
    }
    const next = { title: title.trim(), notes, start: range.start.getTime(), end: range.end.getTime() };
    if (next.title === saved.title && next.notes === saved.notes && next.start === saved.start && next.end === saved.end) {
      return;
    }

    // The write draws itself on the grid before it asks the server, so nothing here waits on the
    // network to look done — only the error, if one comes back, arrives late.
    saved = next;
    await data.editEvent(event, {
      title: next.title,
      description: next.notes,
      start: range.start,
      end: range.end,
    });
  }

  /** A link that refuses to open says so on the card, rather than doing nothing at all. */
  async function open(url: string) {
    try {
      await openExternal(url);
    } catch (e) {
      diagnostics.report("Link", e, { title: "That link wouldn’t open" });
    }
  }

  /** The link whose copy button has just been pressed, so it can say so for a moment. */
  let copied = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  /** Copies the link as it was written, not the account-tagged one a Join opens. */
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copied = url;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), 1500);
    } catch {
      diagnostics.report("Link", "That link wouldn’t copy.", { title: "That link wouldn’t copy" });
    }
  }

  $effect(() => () => {
    if (copiedTimer) clearTimeout(copiedTimer);
  });

  function close() {
    flush();
    data.deselect();
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

  // Enter commits from any single-line field; the notes get their own newlines.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && editable && !(e.target instanceof HTMLTextAreaElement)) flush();
  }
</script>

<svelte:window {onkeydown} />

{#snippet pill(link: { url: string; label: string })}
  {@const done = copied === link.url}
  <span class="group/pill relative inline-block max-w-full align-baseline">
    <span class="chip-bare max-w-full">
      <span class="min-w-0 truncate">{link.label}</span>
    </span>
    <!-- The same pill, laid over the first and grown by an icon when pointed at, so the words never move. -->
    <span
      class="chip-bare absolute top-0 left-0 z-10 h-full max-w-none whitespace-nowrap opacity-0 transition-opacity group-hover/pill:opacity-100 has-[:focus-visible]:opacity-100 {done
        ? 'opacity-100'
        : ''}"
    >
      <button type="button" class="press-sm text-left" onclick={() => void open(asGoogleAccount(link.url, accountEmail))}>
        {link.label}
      </button>
      <span
        class="inline-flex overflow-hidden transition-[max-width] duration-150 {done
          ? 'max-w-6'
          : 'max-w-0 group-hover/pill:max-w-6 has-[:focus-visible]:max-w-6'}"
      >
        <button
          type="button"
          class="press-sm shrink-0 rounded p-0.5 text-fg-faint hover:text-fg"
          aria-label={done ? "Link copied" : "Copy link"}
          title={done ? "Copied" : "Copy link"}
          onclick={() => void copy(link.url)}
        >
          {#if done}
            <Check size={12} />
          {:else}
            <Copy size={12} />
          {/if}
        </button>
      </span>
    </span>
  </span>
{/snippet}

<AnchoredPopup {rect} width={WIDTH} dismiss={!nested} onclose={close}>
  <div class="relative">
    <!--
      What can be done to it, pinned to the corner: on the project line when there is one, and
      beside the name when the project has been folded away.
    -->
    <div class="absolute right-3 flex items-center gap-0.5 {shown('project') ? 'top-2' : 'top-3.5'}">
      <!-- The assistant's seat at the table. What it does when pressed is the next thing to build. -->
      <button type="button" title="Ask about this event" class={ACTION} onclick={() => undefined}>
        <Sparkles size={13} />
      </button>
      {#if editable}
        <button
          type="button"
          title="Delete event"
          class={ACTION}
          onclick={() => {
            deleted = true;
            if (timer) clearTimeout(timer);
            void data.deleteEvent(event);
          }}
        >
          <Trash2 size={13} />
        </button>
      {/if}
      {#if !event.allDay}
        <CardSettings
          sections={SECTIONS}
          {hidden}
          ontoggle={toggleSection}
          source={event.source}
          onlink={(source) => void link(source)}
          onunlink={unlink}
        />
      {/if}
      <button type="button" title="Close" class={ACTION} onclick={close}>
        <X size={13} />
      </button>
      </div>

    <!--
      The line above everything: what the hour was for. The sphere is the icon beside the name, so
      it is not said twice; the purpose is tagged from here, because tagging a grey block after the
      fact is how a real week is reconciled and it should cost one tap.
    -->
    {#if shown("project")}
    <div class="flex min-w-0 items-center gap-1.5 px-3 pt-2 pr-28">
      {#if purpose}
        <span class="t-micro flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-fg-muted">
          <button
            type="button"
            class="press-sm min-w-0 truncate hover:text-fg"
            title="Change what this is for"
            onclick={(e) => (projectRect = e.currentTarget.getBoundingClientRect())}
          >
            {purpose}
          </button>
          {#if !detaching}
            <button
              type="button"
              aria-label="Detach from {purpose}"
              onclick={() => (detaching = true)}
              class="press-sm shrink-0 rounded p-0.5 text-fg-faint hover:text-fg"
            >
              <X size={11} />
            </button>
          {/if}
        </span>
        {#if detaching}
          <span class="t-micro flex shrink-0 items-center gap-2 text-fg-muted">
            Detach?
            <button type="button" onclick={detach} class="press-sm t-micro text-fg underline">Yes</button>
            <button type="button" onclick={() => (detaching = false)} class="press-sm t-micro text-fg-faint">No</button>
          </span>
        {/if}
      {:else}
        <button
          type="button"
          class="press-sm t-micro shrink-0 rounded px-1 py-0.5 text-fg-faint hover:text-fg"
          onclick={(e) => (projectRect = e.currentTarget.getBoundingClientRect())}
        >
          Add Project
        </button>
      {/if}
    </div>
    {/if}

    <!-- Header: what it counts as and what it's called, beside the things you can do to it. -->
    <div class="flex items-center gap-1 px-3 pb-2 {shown('project') ? 'pt-1' : 'pt-2 pr-28'}">
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
          variant="bare"
          ariaLabel="Event title"
          class="t-heading h-9 py-1"
        />
      {:else}
        <h2 class="t-heading flex-1 truncate px-2 py-1">{event.title}</h2>
      {/if}
    </div>
  </div>

  <!-- When it runs. The clock owns the whole block, so the date sits under the times it belongs to. -->
  <div class="border-t border-line px-2 py-2">
    <CardRow icon={Clock} set>
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
        <span class="t-label px-2">{event.allDay ? "All day" : `${formatClock(new Date(event.start))}`}</span>
        {#if !event.allDay}
          <ArrowRight size={14} class="shrink-0 text-fg-faint" />
          <span class="t-label px-2">{formatClock(new Date(event.end))}</span>
          <span class="t-label text-fg-faint">{span}</span>
        {/if}
      {/if}
      {#if !event.allDay}
        <button
          type="button"
          disabled={!editable}
          aria-label="Time zone: {zoneLabel}"
          onclick={(e) => (zoneRect = e.currentTarget.getBoundingClientRect())}
          class="field-bare press-sm t-label ml-auto shrink-0 text-fg-muted"
        >
          {zoneLabel}
        </button>
      {/if}
    </CardRow>

    <CardRow icon={CalendarClock} set>
      {#if editable}
        <!-- Reads as "Fri Aug 14"; the native picker behind it is what's actually being typed in. -->
        <button type="button" onclick={openDatePicker} class="field-bare press-sm t-label shrink-0">
          {dateLabel}
        </button>
        <input
          bind:this={dateEl}
          type="date"
          bind:value={date}
          oninput={queue}
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
          onclick={(e) => (repeatRect = e.currentTarget.getBoundingClientRect())}
          class="field-bare press-sm flex min-w-0 items-center gap-2"
        >
          <Repeat size={14} class="shrink-0 {rule ? 'text-fg-muted' : 'text-fg-faint'}" />
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

  <!-- How you'll be told: the calendar's own reminders, and the rhythm a timer runs at. -->
  {#if !event.allDay}
    <div class="border-t border-line px-2 py-1.5">
      <RemindersRow reminders={event.reminders} editable={remindable} onchange={chooseReminders} />
      {#if shown("timer") && category}
        <Popover width={200} align="start">
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
  {/if}

  <!-- The meeting inside the event: how you get in, who else is coming, where it is. -->
  {#if shown("conferencing") || shown("participants") || shown("location")}
    <div class="border-t border-line px-2 py-1.5">
      {#if shown("conferencing")}
        <ConferencingRow
          {meeting}
          conferenceName={event.conferenceName}
          {joinUrl}
          {editable}
          onjoin={(url) => void open(url)}
          oncopy={(url) => void copy(url)}
          {copied}
          oncreate={addCall}
          onremove={removeCall}
          onpaste={pasteCall}
        />
      {/if}
      {#if shown("participants")}
        <ParticipantsRow attendees={event.attendees} organizer={event.organizer} editable={hosting} onchange={chooseGuests}>
          {#snippet answer()}
            {#if answerable}
              <!-- Only the guest list gets an answer to give, which is why this row isn't an edit. -->
              <!-- One icon with the answer given; pointed at, the other two open beside it and it stays put. -->
              <span class="group/rsvp relative ml-auto inline-block shrink-0 align-middle">
                <span class="chip-bare px-1 {event.response === 'needsAction' ? 'text-fg-faint' : ''}">
                  <said.icon size={12} />
                </span>
                <span
                  class="chip-bare absolute top-0 right-0 z-10 h-full max-w-none gap-0.5 px-1 whitespace-nowrap opacity-0 transition-opacity group-hover/rsvp:opacity-100 has-[:focus-visible]:opacity-100"
                >
                  {#each choices as choice (choice.value)}
                    {@const chosen = event.response === choice.value}
                    <button
                      type="button"
                      aria-pressed={chosen}
                      aria-label={choice.label}
                      title={choice.label}
                      class="press-sm rounded p-0.5 {chosen ? 'bg-ink text-ink-fg' : 'text-fg-faint hover:text-fg'}"
                      onclick={() => respond(choice.value)}
                    >
                      <choice.icon size={12} />
                    </button>
                  {/each}
                </span>
              </span>
            {/if}
          {/snippet}
        </ParticipantsRow>
      {/if}
      {#if shown("location")}
        <LocationRow
          {event}
          location={meeting.location ?? event.location}
          {travelTo}
          {editable}
          onchange={chooseLocation}
          onopen={(url) => void open(url)}
        />
      {/if}
    </div>
  {/if}

  <!-- What it says. -->
  {#if shown("description")}
    <div class="border-t border-line px-2 py-1.5">
      <CardRow icon={AlignLeft} set={Boolean(notes.trim())} align="start">
        <div class="min-w-0 flex-1">
          {#if editable}
            <Textarea bind:value={notes} oninput={queue} rows={2} placeholder="Description" ariaLabel="Event notes" variant="bare" />
          {:else if event.description}
            <p class="t-label px-2 py-1.5 whitespace-pre-wrap text-fg-muted">
              {#each parts as part, i (i)}
                {#if "link" in part}{@render pill(part.link)}{:else}{part.text}{/if}
              {/each}
            </p>
          {:else}
            <p class="t-label px-2 py-1.5 text-fg-faint">Description</p>
          {/if}
          {#if extraLinks.length > 0}
            <div class="flex flex-wrap gap-1 px-2 pb-1.5">
              {#each extraLinks as link (link.url)}
                {@render pill(link)}
              {/each}
            </div>
          {/if}
        </div>
      </CardRow>
    </div>
  {/if}

  <!-- The foot: what's linked into it. -->
  {#if linked}
    {@const Section = linked.feed.section}
    <div class="border-t border-line px-2 py-1.5">
      <Section {event} />
    </div>
  {/if}

  {#if !event.countsTowardHours}
    <p class="t-micro border-t border-line px-3 py-2 text-fg-faint">
      {event.declined ? "You declined this, so it counts toward nothing." : "All-day events don't count as hours."}
    </p>
  {/if}
</AnchoredPopup>

{#if projectRect}
  <ProjectPicker rect={projectRect} value={purposeKey} categoryId={category?.id} onchoose={choosePurpose} onclose={() => (projectRect = null)} />
{/if}

{#if pickerRect}
  <CategoryPicker
    rect={pickerRect}
    categories={plannable}
    value={category?.id ?? ""}
    onchoose={chooseCategory}
    onclose={() => (pickerRect = null)}
  />
{/if}

{#if zoneRect}
  <TimeZonePicker rect={zoneRect} value={zone} at={new Date(event.start)} onchoose={chooseZone} onclose={() => (zoneRect = null)} />
{/if}

{#if repeatRect}
  <RepeatPicker rect={repeatRect} value={rule} day={new Date(event.start)} onchoose={chooseRule} onclose={() => (repeatRect = null)} />
{/if}
