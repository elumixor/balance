import { SvelteMap } from "svelte/reactivity";
import { applyCalendarEvent, dropCalendarEvent, invalidate } from "$lib/core/store.svelte";
import { activities } from "$lib/core/synced.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { type EventFields, type Mapping, mappingFieldsOf, NO_PURPOSE, type Purpose, purposeOf } from "./purpose";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  removeEventMapping,
  saveEventMapping,
  updateCalendarEvent,
} from "./queries";
import type { CalendarEvent, CalendarWeek, MappingScope } from "./types";

/** How many events keep a handle before the lot is dropped — see `ref`. */
const REF_LIMIT = 200;

/** The id a block wears between being drawn and the calendar giving it a real one. */
const DRAFT_PREFIX = "draft:";

/** What a write draws on the grid before the server has confirmed it — `null` being "gone". */
export interface Drawn {
  readonly id: string;
  readonly event: CalendarEvent | null;
}

/**
 * A handle on one event across the writes that touch it. Undoing a delete makes a new event with
 * a new id, and the steps recorded before that have to keep pointing at the same block.
 */
export interface EventRef {
  id: string;
  calendarId: string;
}

/** What the writes read back from the screen: the weeks as fetched, and the events as shown. */
export interface WritesHost {
  readonly weeks: readonly { readonly value: CalendarWeek | undefined }[];
  readonly events: readonly CalendarEvent[];
  refreshWeeks(): Promise<unknown>;
}

/**
 * Every write to the calendar, drawn on the grid first and sent to the server second, one at a
 * time. Each method here is one write, so an undo can run the same one backwards; what makes a
 * step out of them is `CalendarEdits`.
 */
export class CalendarWrites {
  /**
   * What a write has already done to the grid, before the server has agreed to it. Letting go of
   * a block has to leave it where it was let go — a round trip to Google is most of a second, and
   * for that whole second the old version is a lie the app is telling about work already done.
   *
   * A `null` is an event deleted. Entries live until the refetch that replaces them lands, so the
   * block never blinks back to where it came from, and a write that failed is undone by the
   * server's own answer rather than by remembering what to put back.
   */
  readonly #pending = new SvelteMap<string, CalendarEvent | null>();
  /** Ids for events that don't have one yet — see `draftId`. */
  #nextTempId = 0;
  /** One handle per event the history still has a step for — see `ref`. */
  readonly #refs = new Map<string, EventRef>();
  /** The writes waiting their turn at the server — see `run`. */
  #queue: Promise<unknown> = Promise.resolve();
  /**
   * Which write each drawn-ahead block belongs to. Editing the same event twice in a row leaves
   * the first write holding a version of it nobody wants any more: without this, that write's
   * refetch would take the second one's block off the grid and put its own back for a second.
   */
  readonly #drawnBy = new Map<string, symbol>();
  readonly #host: WritesHost;

  constructor(host: WritesHost) {
    this.#host = host;
  }

  /** The drawn-ahead versions, laid over the weeks by whoever lists the events. */
  get drawn(): ReadonlyMap<string, CalendarEvent | null> {
    return this.#pending;
  }

  /** Whether the block is one the calendar hasn't given a real id to yet. */
  isDraft(id: string) {
    return id.startsWith(DRAFT_PREFIX);
  }

  /** A made-up id for a block drawn before the calendar has answered for it. */
  draftId() {
    return `${DRAFT_PREFIX}${this.#nextTempId++}`;
  }

  /** Draws a draft's edits where the block already is, until there is an id to write them against. */
  draw(id: string, event: CalendarEvent) {
    this.#pending.set(id, event);
  }

  /**
   * The one handle for an event, shared by every step that touches it. Old entries are worth no
   * more than the events they point at, so the map is emptied rather than grown without end —
   * the steps holding a handle keep working, they just stop being found by id.
   */
  ref(event: CalendarEvent): EventRef {
    const known = this.#refs.get(event.id);
    if (known) return known;
    if (this.#refs.size > REF_LIMIT) this.#refs.clear();
    const ref = { id: event.id, calendarId: event.calendarId };
    this.#refs.set(event.id, ref);
    return ref;
  }

  /**
   * Points every step and every queued write that holds this handle at the event the calendar has
   * actually made — what was written against a made-up id lands on the real one.
   */
  moveRef(ref: EventRef, created: CalendarEvent) {
    this.#refs.delete(ref.id);
    ref.id = created.id;
    ref.calendarId = created.calendarId;
    this.#refs.set(ref.id, ref);
  }

  /**
   * The event as the last write left it: the weeks with the drawn-ahead versions over the top,
   * and deliberately not the screen's `events`, which also carries the times the editor is
   * previewing. A diff taken against a preview finds nothing to write — and what it found nothing
   * to write for is the very write the preview was leading up to.
   */
  #written(id: string): CalendarEvent | undefined {
    if (this.#pending.has(id)) return this.#pending.get(id) ?? undefined;
    return this.#host.weeks.flatMap((week) => week.value?.events ?? []).find((event) => event.id === id);
  }

  async writeFields(ref: EventRef, was: CalendarEvent, fields: EventFields): Promise<boolean> {
    // Only what actually moved. A write that carries the title along with a new end time is a
    // write of the title as far as the calendar and everyone else reading it is concerned, and
    // two edits racing over one field are only a race if both of them name that field.
    const base = this.#written(ref.id) ?? was;
    const patch: {
      title?: string;
      description?: string;
      start?: string;
      end?: string;
    } = {};
    if (fields.title !== base.title) patch.title = fields.title;
    // An empty string is how the calendar is told the notes are gone; leaving it out keeps them.
    const description = fields.description ?? "";
    if (description !== (base.description ?? "")) patch.description = description;
    if (fields.start.getTime() !== new Date(base.start).getTime()) patch.start = fields.start.toISOString();
    if (fields.end.getTime() !== new Date(base.end).getTime()) patch.end = fields.end.toISOString();
    // Nothing to say. An undo of an edit that was itself a no-op lands here, as does the editor
    // committing a field the grid already moved.
    if (Object.keys(patch).length === 0) return true;

    const done = await this.run(
      () => updateCalendarEvent(ref.id, { calendarId: ref.calendarId, ...patch }),
      {
        id: ref.id,
        event: {
          ...was,
          id: ref.id,
          calendarId: ref.calendarId,
          title: fields.title,
          description: fields.description,
          start: fields.start.toISOString(),
          end: fields.end.toISOString(),
        },
      },
      (event) => applyCalendarEvent(event, ref.id),
    );
    return done !== null;
  }

  /**
   * Set or clear what an event counts as. A whole series recolours every instance of it, which is
   * more than this screen can work out on its own — so only the single-instance case gets to show
   * its answer early.
   */
  async writeMapping(
    ref: EventRef,
    was: CalendarEvent,
    scope: MappingScope,
    choice: Mapping["choice"] | null,
    purpose?: Purpose,
  ): Promise<boolean> {
    // Read when the write is actually sent: an event put back by an undo is a new event by then.
    const target = () => ({
      calendarId: ref.calendarId,
      externalEventId: scope === "series" && was.seriesId ? was.seriesId : ref.id,
      scope,
    });
    const activity = activities.all.find((a) => a.id === choice?.activityId) ?? null;
    // Untagged with the mapping: what an hour was for is a fact about what it counted as.
    const kept = choice ? (purpose ?? purposeOf(was)) : NO_PURPOSE;
    const restyle = (event: CalendarEvent): CalendarEvent => ({
      ...event,
      mappingScope: choice ? scope : null,
      activityId: choice?.activityId ?? null,
      activityName: choice ? (activity?.name ?? null) : null,
      weights: choice ? (choice.weights ?? activity?.weights ?? []) : [],
      ...kept,
    });
    const drawn: Drawn[] =
      scope === "instance"
        ? [
            {
              id: ref.id,
              event: restyle({
                ...was,
                id: ref.id,
                calendarId: ref.calendarId,
              }),
            },
          ]
        : was.seriesId
          ? this.#host.events
              .filter((event) => event.seriesId === was.seriesId)
              .map((event) => ({ id: event.id, event: restyle(event) }))
          : [];

    const done = await this.run<unknown>(
      () => (choice ? saveEventMapping({ ...target(), ...choice, ...(purpose ?? {}) }) : removeEventMapping(target())),
      drawn,
      // What an instance now counts as is worked out here in full, so the answer is already on
      // the screen — there is nothing to ask the server for. A series recolours instances this
      // strip has never loaded, which only a refetch can know about.
      scope === "instance" ? () => drawn[0]?.event && applyCalendarEvent(drawn[0].event) : undefined,
    );
    return done !== null;
  }

  async remove(ref: EventRef): Promise<boolean> {
    const done = await this.run(
      () => deleteCalendarEvent(ref.id, ref.calendarId),
      { id: ref.id, event: null },
      () => dropCalendarEvent(ref.id),
    );
    return done !== null;
  }

  /**
   * Puts a deleted event back. The calendar gives it a new id, so the handle every step of this
   * event's history holds is moved onto it — and the mapping, which the delete took with it, is
   * written again over the new event.
   */
  async restore(ref: EventRef, was: CalendarEvent): Promise<boolean> {
    const created = await this.run(
      () =>
        createCalendarEvent({
          ...mappingFieldsOf(was),
          calendarId: was.calendarId,
          title: was.title,
          description: was.description ?? undefined,
          start: was.start,
          end: was.end,
        }),
      { id: ref.id, event: { ...was, id: ref.id, calendarId: ref.calendarId } },
      (event) => applyCalendarEvent(event, ref.id),
    );
    if (!created) return false;

    this.moveRef(ref, created);
    return true;
  }

  /**
   * Every write puts its answer on the grid first and asks the server second, and the server's
   * own answer to that write is what the week ends up holding — not a refetch of the week.
   *
   * A refetch would be three requests for three weeks of events to learn about one block the
   * answer already described, and Google will happily serve a read with the version from before
   * the write it has just accepted, so the refetched week is not even reliably newer. What the
   * write returns is: it goes into the caches through `apply`, and the drawn-ahead version comes
   * off in the same turn, so the block never blinks.
   *
   * Writes whose reach this screen can't work out — a series edit, a series mapping — pass no
   * `apply` and refetch instead. A write that failed rolls back to what the caches already hold,
   * which is the version from before it was drawn, and marks the weeks worth checking later.
   *
   * The asking is one at a time. Two writes to the same event in flight together land in whichever
   * order Google gets to them, and undoing three edits in a second is exactly that case.
   */
  run<T>(action: () => Promise<T>, drawn?: Drawn | readonly Drawn[], apply?: (answer: T) => void): Promise<T | null> {
    const drawnList = drawn ? (Array.isArray(drawn) ? drawn : [drawn]) : [];
    // Drawn now, before anything is queued: this is the whole point of drawing ahead. Holding
    // ⌘Z stacks its answers up on the grid at once and lets the writes catch up behind them.
    const token = Symbol("write");
    for (const one of drawnList) {
      this.#pending.set(one.id, one.event);
      this.#drawnBy.set(one.id, token);
    }
    /** Whether this write's version of the block is still the one on screen — see `#drawnBy`. */
    const current = () => drawnList.length > 0 && drawnList.every((one) => this.#drawnBy.get(one.id) === token);

    const run = this.#queue.then(async () => {
      // What the write answered, kept so the step that recorded it can be run backwards later.
      let answer: T | null = null;
      let saved = false;
      try {
        answer = await action();
        saved = true;
      } catch (e) {
        diagnostics.report("Calendar", e, { title: "That didn’t save" });
      }
      try {
        if (!saved) {
          // The caches still hold what the server had before this was drawn, so taking the drawn
          // version off is the whole rollback. They're marked stale in case the write landed
          // anyway and only the answer was lost.
          invalidate.calendar();
        } else if (apply) {
          apply(answer as T);
        } else {
          invalidate.calendar();
          await this.#host.refreshWeeks();
        }
      } finally {
        if (current()) {
          for (const one of drawnList) {
            this.#pending.delete(one.id);
            this.#drawnBy.delete(one.id);
          }
        }
      }
      return saved ? answer : null;
    });
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
