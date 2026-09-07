<script lang="ts" module>
  /** Which of the card's own pickers is open, and where. The card stays up while any is. */
  export interface Pickers {
    category: DOMRect | null;
    project: DOMRect | null;
    zone: DOMRect | null;
    repeat: DOMRect | null;
  }
</script>

<script lang="ts">
  import { AnchoredPopup } from "$lib/components";
  import type { Category } from "$lib/core/records";
  import { openExternal } from "$lib/desktop/open";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { FEEDS, integrations } from "$lib/integrations/integrations.svelte";
  import { meetingOf } from "$lib/calendar/meeting";
  import { purposeOf } from "$lib/calendar/purpose";
  import { preferences } from "$lib/account/preferences.svelte";
  import { accountEmailOf, calendarData } from "$lib/calendar/calendar-data.svelte";
  import { EventDraft, samePreview } from "$lib/calendar/event-draft.svelte";
  import { fromRecurrence, NEVER, toRRule } from "$lib/calendar/recurrence";
  import type { CalendarEvent, MappingScope } from "$lib/calendar/types";
  import { AlignLeft, FolderKanban, MapPin, Sparkles, Timer, Trash2, Users, Video, X } from "lucide-svelte";
  import { untrack } from "svelte";
  import CardSettings, { type CardSection } from "./CardSettings.svelte";
  import DescriptionSection from "./DescriptionSection.svelte";
  import EditorFooter from "./EditorFooter.svelte";
  import EditorHeader from "./EditorHeader.svelte";
  import MeetingSection from "./MeetingSection.svelte";
  import RemindersSection from "./RemindersSection.svelte";
  import TimeSection from "./TimeSection.svelte";

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
  const ACTION_ICON = 13;

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
  const draft = new EventDraft({
    becameId: (id) => data.becameId(id),
    editEvent: (target, fields) => data.editEvent(target, fields),
    report: (title, error) => diagnostics.report("Calendar", error, { title }),
  });

  const editable = $derived(draft.editable);
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
    void draft.write("The card layout wasn’t saved", data.tagEvent(event, { hidden: [...next] }));
  }

  // A repeating event always counts as the same thing on every occurrence — only a one-off event
  // gets an instance-scoped mapping.
  const scope: MappingScope = $derived(event.seriesId ? "series" : "instance");
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
  const rule = $derived(fromRecurrence(event.recurrence));
  const meeting = $derived(meetingOf(event));
  const accountEmail = $derived(accountEmailOf(event.calendarId));

  const NO_PICKERS: Pickers = { category: null, project: null, zone: null, repeat: null };
  let pickers = $state<Pickers>({ ...NO_PICKERS });
  const nested = $derived(Boolean(pickers.category || pickers.project || pickers.zone || pickers.repeat));

  let titleEl = $state<HTMLInputElement | null>(null);
  /** Whether the cursor has already been put in the name of the block on show — see below. */
  let focused = false;

  // Selecting another block while this one is open swaps the prop rather than remounting. The
  // load reads nothing this effect should re-run on: only the block itself changing matters.
  $effect(() => {
    const next = event;
    if (!untrack(() => draft.load(next))) return;
    focused = false;
    pickers = { ...NO_PICKERS };
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
      if (draft.title) input.setSelectionRange(draft.title.length, draft.title.length);
      else input.select();
    });
    return () => cancelAnimationFrame(frame);
  });

  /** A pending edit still belongs to the user, so it's written before the card goes away. */
  $effect(() => () => draft.flush());

  // The block on the grid is drawn where a time field is pointing. Written only when it actually
  // says something else: the preview changes the event this card is showing, which would
  // otherwise hand the effect its own answer back forever.
  $effect(() => {
    const next = draft.preview;
    if (!samePreview(data.preview, next)) data.preview = next;
  });

  /** Nothing is being decided once the card is gone, so nothing is drawn ahead of the week either. */
  $effect(() => () => (data.preview = null));

  // --- what feeds it -------------------------------------------------------------------------

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
    const title = "The feed wasn’t linked";
    // A feed records every night, so a one-off block is first made a daily series, and the link
    // lands on the series: the block becomes its master, and every occurrence carries the feed.
    let target = event;
    let targetScope = scope;
    if (!event.seriesId && !rule) {
      const lines = [toRRule({ frequency: "daily", interval: 1, weekdays: [], end: NEVER })];
      await draft.write(title, data.patchEvent(event, { recurrence: lines }, { recurrence: [] }));
      target = { ...event, seriesId: event.id, recurrence: lines };
      targetScope = "series";
    }
    if (!category) {
      const word = entry.feed.label.toLowerCase();
      const guess = categories.find((c) => c.name.toLowerCase().includes(word)) ?? categories.find((c) => c.isBuffer);
      if (!guess) return;
      const purpose = purposeOf(event);
      await draft.write(
        title,
        data.mapEvent(target, targetScope, { weights: [{ categoryId: guess.id, weightPercent: 100 }] }, { ...purpose, source }),
      );
    } else {
      await draft.write(title, data.tagEvent(target, { source }));
    }
    if (entry.integration.available) void integrations.sync(entry.integration, entry.feed);
  }

  function unlink() {
    void draft.write("The feed wasn’t unlinked", data.tagEvent(event, { source: null }));
  }

  // --- the card itself -----------------------------------------------------------------------

  function remove() {
    draft.discard();
    void draft.write("The event wasn’t deleted", data.deleteEvent(event));
  }

  /** A link that refuses to open says so on the card, rather than doing nothing at all. */
  async function open(url: string) {
    try {
      await openExternal(url);
    } catch (e) {
      diagnostics.report("Link", e, { title: "That link wouldn’t open" });
    }
  }

  function close() {
    draft.flush();
    data.deselect();
  }

  // Enter commits from any single-line field; the notes get their own newlines.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && editable && !(e.target instanceof HTMLTextAreaElement)) draft.flush();
  }
</script>

<svelte:window {onkeydown} />

<AnchoredPopup {rect} width={WIDTH} dismiss={!nested} onclose={close}>
  <div class="relative">
    <!--
      What can be done to it, pinned to the corner: on the project line when there is one, and
      beside the name when the project has been folded away.
    -->
    <div class="absolute right-3 flex items-center gap-0.5 {shown('project') ? 'top-2' : 'top-3.5'}">
      <!-- The assistant's seat at the table. What it does when pressed is the next thing to build. -->
      <button type="button" title="Ask about this event" class={ACTION} onclick={() => undefined}>
        <Sparkles size={ACTION_ICON} />
      </button>
      {#if editable}
        <button type="button" title="Delete event" class={ACTION} onclick={remove}>
          <Trash2 size={ACTION_ICON} />
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
        <X size={ACTION_ICON} />
      </button>
    </div>

    <EditorHeader {event} {draft} {categories} {category} withProject={shown("project")} bind:pickers bind:titleEl onclose={close} />
  </div>

  <TimeSection {event} {draft} {rule} {heldBy} bind:pickers />

  {#if !event.allDay}
    <RemindersSection {event} {draft} {remindable} withTimer={shown("timer") && Boolean(category)} />
  {/if}

  {#if shown("conferencing") || shown("participants") || shown("location")}
    <MeetingSection
      {event}
      {draft}
      {meeting}
      {accountEmail}
      conferencing={shown("conferencing")}
      participants={shown("participants")}
      location={shown("location")}
      onopen={(url) => void open(url)}
    />
  {/if}

  {#if shown("description")}
    <DescriptionSection {event} {draft} {meeting} {accountEmail} onopen={(url) => void open(url)} />
  {/if}

  <EditorFooter {event} />
</AnchoredPopup>
