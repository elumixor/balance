import { oauthConnect } from "$lib/core/oauth-connect";
import type { ActivityWeight } from "$lib/core/records";
import { calendarWeek, store } from "$lib/core/store.svelte";
import { projects, synced } from "$lib/core/synced.svelte";
import { clock } from "$lib/platform/clock.svelte";
import { viewport } from "$lib/platform/viewport.svelte";
import { addDays, DAYS_PER_WEEK, daysBetween, startOfDay, startOfWeek, weekKey } from "./dates";
import { CalendarDrag, type DragHost, type DragSource, dropMoves } from "./drag.svelte";
import { CalendarEdits } from "./edits.svelte";
import { instantAt, SIDE_WEEKS, STRIP_DAYS, STRIP_WEEKS } from "./geometry";
import type { Answer } from "./purpose";
import { startZoomConnect } from "./queries";
import { CalendarSelection } from "./selection.svelte";
import { CalendarSeries } from "./series.svelte";
import type { CalendarEvent, SeriesScope } from "./types";
import { CalendarWrites } from "./writes.svelte";

export type { Answer };
/** What the components import from here besides the singleton — see `WeekGrid`, `EventEditor`. */
export { STRIP_DAYS };

/** Day columns a window narrower than the rail's breakpoint holds — see `CalendarData.visibleDays`. */
const PHONE_DAYS = 3;

/**
 * The calendar screen's state: which week is on show, what's being dragged, and the writes that
 * follow. A module-level singleton like every other screen's data — switching tabs keeps the week
 * you were looking at.
 *
 * The parts each own one job — `CalendarSelection`, `CalendarWrites`, `CalendarSeries`,
 * `CalendarEdits`, `CalendarDrag` — and this is the window they all look through: which days are
 * on screen, the events those days hold, and the members the screens call.
 */
class CalendarData {
  /**
   * How many day columns the window holds. A phone gets three: seven columns on a 390pt screen
   * leave a block 45pt wide, which is narrower than the finger meant to grab it and too narrow to
   * carry a title. Everything that counts days — where a jump lands, which week the meters are
   * about, how far a slide travels — reads this rather than assuming a week.
   */
  readonly visibleDays = $derived(viewport.md ? DAYS_PER_WEEK : PHONE_DAYS);

  /** Opens on the current week — or, where the window is narrower than one, on today. */
  #anchor = $state(viewport.md ? startOfWeek(new Date()) : startOfDay(new Date()));

  get anchor() {
    return this.#anchor;
  }

  /**
   * Assigned rather than only stepped, from the menu bar as well as from this screen — so this is
   * the one place that knows the window has moved, and the place the caches behind it are
   * resolved from. See `#resolveWeeks` for why that can't be left to the deriveds below.
   */
  set anchor(value: Date) {
    const day = startOfDay(value);
    // Same day, new `Date` — the grid's deriveds are all objects, so an assignment that changes
    // nothing would still invalidate every one of them and have the grid re-place its whole strip.
    if (day.getTime() === this.#anchor.getTime()) return;
    this.#anchor = day;
    this.#resolveWeeks();
  }

  /**
   * Set right before a jump that didn't come from a swipe (today, a month arrow, a tapped date in
   * the month grid), so the grid eases the scroll there instead of the instant, no-op-looking snap
   * a Monday-to-Monday jump would otherwise be — the strip recentres on the same offset either way,
   * so without this the columns swap out with no visible motion. The grid clears it once consumed.
   */
  animateNextJump = $state(false);
  /**
   * Times the editor is entering right now, drawn on the grid before anything is written: typing a
   * new end, or walking the suggested ones, moves the block while it's being decided.
   */
  preview = $state<{ id: string; start: string; end: string } | null>(null);

  readonly #selection = new CalendarSelection();
  readonly #writes = new CalendarWrites(this);
  readonly #series = new CalendarSeries(this.#writes, this);
  readonly #edits = new CalendarEdits(this.#writes, this.#series, this.#selection, this);
  readonly #drag = new CalendarDrag(this.#dragHost(), this.#selection);
  /** The writes ⌘Z can take back — every editing method records one. */
  readonly history = this.#edits.history;
  /**
   * The blocks gathered for a write that applies to all of them — by dragging a box over empty
   * grid, or by ⌘-clicking them one at a time.
   */
  readonly picked = this.#selection.picked;

  /** The first day on screen — any day, not just a Monday. */
  readonly windowStart = $derived(startOfDay(this.anchor));

  /**
   * The grid draws whole weeks and shows a run of days out of them, so there's always room to
   * scroll into on either side and the day columns line up with the week the events came in.
   */
  readonly stripStart = $derived(addDays(startOfWeek(this.windowStart), -SIDE_WEEKS * DAYS_PER_WEEK));
  readonly dayOffset = $derived(daysBetween(this.stripStart, this.windowStart));

  /**
   * The strip's caches, put here by `#resolveWeeks` rather than worked out on demand: making a
   * week is a write, and a write is the one thing a `$derived` may not do. The derived below is
   * only the reading half, which is what every screen and every meter actually wants.
   */
  #stripWeeks = $state(stripWeeksFrom(this.stripStart));
  readonly weeks = $derived(this.#stripWeeks);

  /**
   * One copy of each event — the ones that straddle Sunday night come back in two weeks'
   * answers — with anything the finger has already done laid over the top.
   *
   * Filtered by which calendars are shown, client-side: the server filters the same way, but
   * that answer is a round trip behind, and the sidebar toggle has to feel instant.
   */
  readonly events = $derived.by(() => {
    const byId = new Map(this.weeks.flatMap((week) => week.value?.events ?? []).map((event) => [event.id, event]));
    for (const [id, event] of this.#writes.drawn) {
      if (event) byId.set(id, event);
      else byId.delete(id);
    }
    // Times the editor is showing but hasn't written yet, so a block on the grid answers the
    // typing that will move it — the same thing a resize drag does, without the finger.
    const preview = this.preview;
    const previewed = preview && byId.get(preview.id);
    if (preview && previewed)
      byId.set(preview.id, {
        ...previewed,
        start: preview.start,
        end: preview.end,
      });
    const prefs = store.calendars.value;
    if (!prefs) return [...byId.values()];
    // `accounts` is absent when the server is older than this bundle — which the macOS build can
    // be, since it runs local code against the deployed API. No calendars is a week that draws
    // everything, not a screen that dies.
    const allCalendars = (prefs.accounts ?? []).flatMap((a) => a.calendars);
    const primaryIds = new Set(allCalendars.filter((c) => c.primary).map((c) => c.id));
    const shownIds = prefs.visibleCalendarIds.length === 0 ? primaryIds : new Set(prefs.visibleCalendarIds);
    return [...byId.values()].filter((event) => shownIds.has(event.calendarId));
  });

  /**
   * What the meters total against: `events`, with whatever a live move or resize would do to a
   * block laid over the top — so a category's number follows the pointer instead of waiting for
   * the drop's write. Kept apart from `events` itself, which the grid positions blocks from and
   * which alt-drag's ghost already covers on its own.
   */
  readonly eventsForTotals = $derived.by(() => {
    const drag = this.drag;
    if (!drag?.event || (drag.kind !== "move" && drag.kind !== "resize" && drag.kind !== "resize-start")) {
      return this.events;
    }
    const moves = dropMoves(drag, instantAt(drag.day, drag.startMinutes), instantAt(drag.day, drag.endMinutes));
    const moved = moves.map(({ event, start, end }) => ({
      ...event,
      start: start.toISOString(),
      end: end.toISOString(),
    }));

    // Alt-drag drops a duplicate and leaves the original where it was, so the total gains a block
    // instead of moving one.
    if (drag.copy) return [...this.events, ...moved.map((event) => ({ ...event, id: `${event.id}:drag-copy` }))];

    const byId = new Map(this.events.map((event) => [event.id, event]));
    for (const event of moved) byId.set(event.id, event);
    return [...byId.values()];
  });

  /**
   * The window can straddle two calendar weeks; the one holding its middle day is the week the
   * meters and the title are about. Stepping to that middle day lands on it by itself.
   */
  readonly weekStart = $derived(startOfWeek(addDays(this.windowStart, Math.floor(this.visibleDays / 2))));
  readonly key = $derived(weekKey(this.weekStart));
  /** The focused week's cache, resolved alongside the strip's and read the same way. */
  #focusedWeek = $state(calendarWeek(this.key));
  readonly week = $derived(this.#focusedWeek);

  /**
   * Whether the account's calendar connection is a settled question. Days, hours and today's line
   * are the grid whether or not anything is connected, so the week draws from the first frame and
   * nothing on the screen may say "connect" until the server has actually said there's nothing to
   * connect to — the alternative is asking every cold start and taking it back a moment later.
   */
  readonly connectionKnown = $derived(this.weeks.some((week) => week.hasValue) || store.integrations.hasValue);
  readonly connected = $derived(
    this.week.value?.connected ?? store.integrations.value?.some((i) => i.connected) ?? false,
  );
  readonly needsReconnect = $derived(this.week.value?.needsReconnect ?? false);
  readonly isThisWeek = $derived(this.key === weekKey(clock.now));

  /** "August 2026", or "Jul – Aug 2026" for the weeks that straddle two. */
  readonly monthLabel = $derived.by(() => {
    const end = addDays(this.weekStart, DAYS_PER_WEEK - 1);
    const year = end.getFullYear();
    if (this.weekStart.getMonth() === end.getMonth()) {
      return `${end.toLocaleDateString(undefined, { month: "long" })} ${year}`;
    }
    const from = this.weekStart.toLocaleDateString(undefined, {
      month: "short",
    });
    const to = end.toLocaleDateString(undefined, { month: "short" });
    return `${from} – ${to} ${year}`;
  });

  /** The gathered blocks themselves, as the week currently holds them. */
  readonly pickedEvents = $derived(this.events.filter((event) => this.picked.has(event.id)));

  /** The open event as the week currently holds it, or null once it's gone from the week. */
  readonly selected = $derived.by(() => {
    const id = this.selectedId;
    if (!id) return null;
    const open = this.events.find((event) => event.id === id);
    if (open) return open;
    // A draft comes off the grid the moment the calendar's own version of it arrives. That's the
    // same block, so the card stays on it rather than closing and opening again.
    const became = this.#edits.becameId(id);
    return (became && this.events.find((event) => event.id === became)) || null;
  });

  // --- what is open, gathered, or under a right-click ------------------------

  get selectedId() {
    return this.#selection.selectedId;
  }
  set selectedId(value: string | null) {
    this.#selection.selectedId = value;
  }
  get selectedRect() {
    return this.#selection.selectedRect;
  }
  set selectedRect(value: DOMRect | null) {
    this.#selection.selectedRect = value;
  }
  get unnamedId() {
    return this.#selection.unnamedId;
  }
  set unnamedId(value: string | null) {
    this.#selection.unnamedId = value;
  }
  get contextMenuEvent() {
    return this.#selection.contextMenuEvent;
  }
  get contextMenuRect() {
    return this.#selection.contextMenuRect;
  }

  select(event: CalendarEvent, rect: DOMRect | null) {
    this.#selection.select(event, rect);
  }

  /**
   * A block's own click, which arrives on whatever captured the pointer rather than on the button
   * inside it — hence a tap being answered here and not by the block. A press that turned into a
   * real drag still ends in a click, and that one isn't a tap.
   */
  tap(event: CalendarEvent, rect: DOMRect, additive = false) {
    if (this.#drag.dragged) return;
    this.#selection.tap(event, rect, additive);
  }

  deselect() {
    this.#selection.deselect();
  }

  openContextMenu(event: CalendarEvent, at: { clientX: number; clientY: number }) {
    this.#selection.openContextMenu(event, at);
  }

  closeContextMenu() {
    this.#selection.closeContextMenu();
  }

  togglePicked(event: CalendarEvent) {
    this.#selection.togglePicked(event);
  }

  clearPicked() {
    this.#selection.clearPicked();
  }

  // --- the window ------------------------------------------------------------

  enter() {
    return Promise.all([synced.ensure(), store.integrations.ensure(), this.ensureWeeks()]);
  }

  ensureWeeks() {
    this.#resolveWeeks();
    return Promise.all(this.#stripWeeks.map((week) => week.ensure()));
  }

  refreshWeeks() {
    this.#resolveWeeks();
    return Promise.all(this.#stripWeeks.map((week) => week.refresh()));
  }

  /**
   * Which caches the strip and the meters are reading, taken from the store by hand. `calendarWeek`
   * makes the week if the map hasn't got it, and making it writes the map — which is why this runs
   * on the imperative paths, where a write is only a write, and never from the deriveds that read
   * the result. Paging is what makes weeks: every path that moves the window comes through here.
   *
   * The arrays are replaced only when the set has actually changed, so scrolling within the three
   * weeks already on the strip, or a write's refetch, costs nothing downstream.
   */
  #resolveWeeks() {
    const strip = stripWeeksFrom(this.stripStart);
    if (strip.some((week, i) => week !== this.#stripWeeks[i])) {
      // Paging can push a week out of the store's map, and coming back to it makes a new, empty
      // cache. Nothing else knows it's empty, so the request that fills it starts here.
      for (const week of strip) if (!this.#stripWeeks.includes(week)) void week.ensure();
      this.#stripWeeks = strip;
    }
    const focused = calendarWeek(this.key);
    if (focused !== this.#focusedWeek) this.#focusedWeek = focused;
  }

  /** Scrolling sideways moves the window a day at a time. */
  goToDay(shift: number) {
    this.anchor = addDays(this.windowStart, shift);
    void this.ensureWeeks();
  }

  goToToday() {
    this.#jumpTo(new Date());
  }

  /** The month grid jumps straight to whichever week a tapped date falls in. */
  goToDate(date: Date) {
    this.#jumpTo(date);
  }

  /**
   * A jump to a week, from a button rather than a swipe. The flag is only raised when the window
   * actually moves: raising it for a tap on the week already on screen would have the grid play a
   * slide over columns that never changed, and the grid clears it only when it animates.
   */
  #jumpTo(date: Date) {
    // A week's worth of columns starts its week on a Monday; three columns can't hold a week, so
    // there the day asked for is the day drawn, first in the window.
    const target = this.visibleDays >= DAYS_PER_WEEK ? startOfWeek(date) : startOfDay(date);
    if (target.getTime() === this.#anchor.getTime()) return;
    this.animateNextJump = true;
    this.anchor = target;
    void this.ensureWeeks();
  }

  // --- dragging --------------------------------------------------------------

  /** The drag reads the window through the façade and drops straight into the edits. */
  #dragHost(): DragHost {
    const self = this;
    return {
      get stripStart() {
        return self.stripStart;
      },
      get windowStart() {
        return self.windowStart;
      },
      get events() {
        return self.events;
      },
      get pickedEvents() {
        return self.pickedEvents;
      },
      get connected() {
        return self.connected;
      },
      create: (source, title, start, end, openAt) => this.#edits.create(source, title, start, end, openAt),
      copyEvents: (moves) => this.#edits.copyEvents(moves),
      retimeEvents: (moves) => this.#edits.retimeEvents(moves),
      retimeEvent: (event, start, end, detach) => this.#edits.retimeEvent(event, start, end, detach),
    };
  }

  get drag() {
    return this.#drag.state;
  }
  get marquee() {
    return this.#drag.marquee;
  }
  /** The whole 21-day strip, registered by the grid so the palette can hit-test against it. */
  get columnsEl() {
    return this.#drag.columnsEl;
  }
  set columnsEl(el: HTMLElement | undefined) {
    this.#drag.columnsEl = el;
  }
  get scrollerEl() {
    return this.#drag.scrollerEl;
  }
  set scrollerEl(el: HTMLElement | undefined) {
    this.#drag.scrollerEl = el;
  }

  beginCreate(source: DragSource, e: PointerEvent) {
    this.#drag.beginCreate(source, e);
  }

  /** A block the week filler proposed and the person accepted — the same write a drop makes. */
  placeBlock(source: DragSource, start: Date, end: Date) {
    return this.#edits.create(source, source.title, start, end);
  }

  /** A project from the rail: a block that counts toward its sphere and is evidence for its gate. */
  sourceForProject(projectId: string, taskId: string | null = null): DragSource | null {
    const project = projects.all.find((p) => p.id === projectId);
    if (!project) return null;
    const task = taskId ? (synced.models.tasks.all.find((t) => t.id === taskId)?.title ?? null) : null;
    return {
      title: task ? `${project.name}: ${task}` : project.name,
      weights: [{ categoryId: project.categoryId, weightPercent: 100 }],
      activityId: null,
      projectId,
      taskId,
    };
  }

  beginMove(event: CalendarEvent, e: PointerEvent) {
    this.#drag.beginMove(event, e);
  }

  beginResize(event: CalendarEvent, e: PointerEvent) {
    this.#drag.beginResize(event, e);
  }

  beginResizeStart(event: CalendarEvent, e: PointerEvent) {
    this.#drag.beginResizeStart(event, e);
  }

  moveDrag(e: PointerEvent) {
    this.#drag.moveDrag(e);
  }

  setDragCopy(copy: boolean) {
    this.#drag.setDragCopy(copy);
  }

  endDrag(e?: { metaKey: boolean; ctrlKey: boolean }) {
    this.#drag.endDrag(e);
  }

  beginMarquee(e: PointerEvent) {
    this.#drag.beginMarquee(e);
  }

  moveMarquee(e: PointerEvent) {
    this.#drag.moveMarquee(e);
  }

  endMarquee() {
    this.#drag.endMarquee();
  }

  abortGesture() {
    this.#drag.abortGesture();
  }

  tapEmpty(e: PointerEvent) {
    this.#drag.tapEmpty(e);
  }

  // --- writes ----------------------------------------------------------------

  /** Whether the block is one the calendar hasn't given a real id to yet. */
  isDraft(id: string) {
    return this.#writes.isDraft(id);
  }

  /** The event a draft turned into, for whatever was open on it — null for any other id. */
  becameId(id: string) {
    return this.#edits.becameId(id);
  }

  /**
   * The editor holds its own copy of the fields it's showing and writes them back when it closes,
   * which is an argument an undo would lose — so an undo closes it first.
   */
  undo() {
    this.deselect();
    return this.history.undo();
  }

  redo() {
    this.deselect();
    return this.history.redo();
  }

  mapEvent: CalendarEdits["mapEvent"] = (...args) => this.#edits.mapEvent(...args);
  tagEvent: CalendarEdits["tagEvent"] = (event, purpose) => this.#edits.tagEvent(event, purpose);
  duplicateEvent: CalendarEdits["duplicateEvent"] = (event) => this.#edits.duplicateEvent(event);
  duplicateEvents: CalendarEdits["duplicateEvents"] = (events) => this.#edits.duplicateEvents(events);
  unmapEvent: CalendarEdits["unmapEvent"] = (event) => this.#edits.unmapEvent(event);
  editEvent: CalendarEdits["editEvent"] = (...args) => this.#edits.editEvent(...args);
  retimeEvent: CalendarEdits["retimeEvent"] = (...args) => this.#edits.retimeEvent(...args);
  patchEvent: CalendarEdits["patchEvent"] = (...args) => this.#edits.patchEvent(...args);
  respondToEvent: CalendarEdits["respondToEvent"] = (event, response) => this.#edits.respondToEvent(event, response);
  moveEventToCalendar: CalendarEdits["moveEventToCalendar"] = (event, calendarId) =>
    this.#edits.moveEventToCalendar(event, calendarId);
  deleteEvent: CalendarEdits["deleteEvent"] = (event, scope) => this.#edits.deleteEvent(event, scope);

  /** What a whole gathered batch counts as — one category over all of them, in one step. */
  mapEvents(events: readonly CalendarEvent[], weights: ActivityWeight[]) {
    return this.#edits.mapEvents(events, weights);
  }

  // --- the series prompt -----------------------------------------------------

  /** A just-edited recurring occurrence, offered the choice to apply the same edit series-wide. */
  get seriesPrompt() {
    return this.#series.prompt;
  }

  applyToSeries(scope: SeriesScope = "all") {
    return this.#series.apply(scope);
  }

  dismissSeriesPrompt() {
    this.#series.dismiss();
  }

  /** A recurring occurrence waiting to hear how much of its series goes with it. */
  get deletePrompt() {
    return this.#series.deletePrompt;
  }

  dismissDeletePrompt() {
    this.#series.dismissDelete();
  }

  /** Second thoughts about the occurrence itself: the offer goes, and so does the edit behind it. */
  undoSeriesEdit() {
    this.#series.dismiss();
    return this.undo();
  }
}

/**
 * Which Google account a calendar came from, as an address — the one thing a Google link needs to
 * open in the right place when the browser is signed into more than one. Null while the calendar
 * list hasn't loaded, or for a calendar no account claims.
 */
export function accountEmailOf(calendarId: string) {
  const prefs = store.calendars.value;
  if (!prefs) return null;
  const account = (prefs.accounts ?? []).find((a) => a.calendars.some((c) => c.id === calendarId));
  return account?.email ?? null;
}

/**
 * A Zoom account, connected if it isn't already — pressed for at the moment it is wanted rather
 * than sent somebody off to Settings first, the same rule the Notion entry points are under.
 * False when the deployment has no Zoom app at all, or the person walked away from the consent
 * screen, in which case nothing else should happen either.
 */
export async function ensureZoom() {
  await store.zoom.ensure();
  if (!store.zoom.value?.available) return false;
  if (store.zoom.value.connected && !store.zoom.value.needsReconnect) return true;
  await oauthConnect({
    start: (mode, origin) => startZoomConnect(mode, origin),
    poll: async () => {
      await store.zoom.refresh();
      return Boolean(store.zoom.value?.connected && !store.zoom.value.needsReconnect);
    },
  });
  return Boolean(store.zoom.value?.connected && !store.zoom.value.needsReconnect);
}

/** The caches for the three weeks drawn from `start`, made if the store hasn't got them yet. */
function stripWeeksFrom(start: Date) {
  return Array.from({ length: STRIP_WEEKS }, (_, i) => calendarWeek(weekKey(addDays(start, i * DAYS_PER_WEEK))));
}

export const calendarData = new CalendarData();
