import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type { ActivityWeight } from "$lib/core/records";
import { applyCalendarEvent, invalidate } from "$lib/core/store.svelte";
import { activities, categories, practices, projects } from "$lib/core/synced.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import type { DragSource } from "./drag.svelte";
import { CalendarHistory, type HistoryStep } from "./history.svelte";
import {
  type Answer,
  answered,
  drawnWith,
  type EventFields,
  mappingFieldsOf,
  mappingOf,
  mergePurpose,
  type Purpose,
  purposeOf,
  sameFields,
} from "./purpose";
import { createCalendarEvent, type EventPatch, respondToCalendarEvent, updateCalendarEvent } from "./queries";
import type { CalendarSelection } from "./selection.svelte";
import type { CalendarSeries } from "./series.svelte";
import { type CalendarEvent, type CalendarWeek, type MappingScope, NOT_A_MEETING, type SeriesScope } from "./types";
import type { CalendarWrites } from "./writes.svelte";

/** How many drafts remember what they became before the lot is dropped. */
const BECAME_LIMIT = 200;

/** One block going somewhere: what a drop, a duplicate or a batch move is made of. */
export interface Move {
  readonly event: CalendarEvent;
  readonly start: Date;
  readonly end: Date;
}

export interface EditsHost {
  readonly week: { readonly value: CalendarWeek | undefined };
  refreshWeeks(): Promise<unknown>;
}

/**
 * What a person does to the week — edits, moves, mappings, replies, deletes — each drawn ahead
 * through `CalendarWrites` and recorded in `history` as a step that runs either way.
 */
export class CalendarEdits {
  /** The writes ⌘Z can take back — every editing method records one. */
  readonly history = new CalendarHistory();
  /**
   * What each draft turned into, so a card open on a block the calendar has only just made knows
   * it's still the same block rather than a different event that happened to appear.
   */
  readonly #became = new Map<string, string>();
  /**
   * Edits made to a block while it was still a draft. There's nothing to write them against until
   * the calendar answers, so they're kept and sent as one write the moment it does.
   */
  readonly #draftEdits = new Map<string, EventFields>();
  readonly #writes: CalendarWrites;
  readonly #series: CalendarSeries;
  readonly #selection: CalendarSelection;
  readonly #host: EditsHost;

  constructor(writes: CalendarWrites, series: CalendarSeries, selection: CalendarSelection, host: EditsHost) {
    this.#writes = writes;
    this.#series = series;
    this.#selection = selection;
    this.#host = host;
  }

  /** The event a draft turned into, for whatever was open on it — null for any other id. */
  becameId(id: string) {
    return this.#became.get(id) ?? null;
  }

  async mapEvent(
    event: CalendarEvent,
    scope: MappingScope,
    choice: { activityId?: string; weights?: ActivityWeight[] },
    purpose?: Purpose,
    /** Off for a write that isn't an edit — folding a card section — so ⌘Z skips over it. */
    record = true,
  ) {
    const ref = this.#writes.ref(event);
    const before = mappingOf(event);
    if (!(await this.#writes.writeMapping(ref, event, scope, choice, purpose))) return;
    if (!record) return;

    this.history.push({
      // The write may have been a series mapping over an instance one: clearing what it wrote is
      // what lets the older, narrower mapping underneath count again.
      undo: async () =>
        (await this.#writes.writeMapping(ref, event, scope, null)) &&
        (before ? this.#writes.writeMapping(ref, event, before.scope, before.choice, before.purpose) : true),
      redo: () => this.#writes.writeMapping(ref, event, scope, choice, purpose),
    });
  }

  /**
   * What an hour was for, decided after the fact. Retro-tagging is how a real week gets
   * reconciled: a grey block somebody else booked becomes evidence for a gate, and an hour that
   * already counted toward a sphere is told which project in that sphere it belonged to. A block
   * that counted as nothing starts counting toward the project's own sphere in the same write.
   */
  async tagEvent(event: CalendarEvent, purpose: Partial<Purpose>) {
    const merged = mergePurpose(purposeOf(event), purpose);
    const existing = mappingOf(event);
    const scope: MappingScope = existing?.scope ?? (event.seriesId ? "series" : "instance");
    // A block that counts as nothing is first made to count as the project's sphere, or as the
    // buffer — the same place an hour nobody planned already lands — so the purpose has a row.
    const sphere =
      projects.all.find((p) => p.id === merged.projectId)?.categoryId ??
      practices.all.find((p) => p.id === merged.practiceId)?.categoryId ??
      categories.all.find((c) => c.isBuffer)?.id;
    const choice = existing?.choice ?? (sphere ? { weights: [{ categoryId: sphere, weightPercent: 100 }] } : null);
    if (!choice) return;
    // Which sections a card folds away is how it's drawn, not what the hour was — not a step.
    const onlyFolds = Object.keys(purpose).every((key) => key === "hidden");
    await this.mapEvent(event, scope, choice, merged, !onlyFolds);
  }

  /** Context-menu duplicate: a new event with the same fields, placed right after the original. */
  duplicateEvent(event: CalendarEvent) {
    const duration = new Date(event.end).getTime() - new Date(event.start).getTime();
    const start = new Date(event.end);
    const end = new Date(start.getTime() + duration);
    return this.#copyEvent(event, start, end);
  }

  duplicateEvents(events: readonly CalendarEvent[]) {
    return Promise.all(events.map((event) => this.duplicateEvent(event)));
  }

  /** Alt-drag: every gathered block is duplicated at its drop position, the originals untouched. */
  copyEvents(moves: readonly Move[]) {
    return Promise.all(moves.map(({ event, start, end }) => this.#copyEvent(event, start, end)));
  }

  /** The whole batch as one step, so ⌘Z takes it back in one press. */
  retimeEvents(moves: readonly Move[]) {
    return this.#batch(moves.map(({ event, start, end }) => this.#retimeStep(event, start, end)));
  }

  async unmapEvent(event: CalendarEvent) {
    const ref = this.#writes.ref(event);
    const before = mappingOf(event);
    const scope = event.mappingScope ?? "instance";
    if (!(await this.#writes.writeMapping(ref, event, scope, null)) || !before) return;

    this.history.push({
      undo: () => this.#writes.writeMapping(ref, event, before.scope, before.choice, before.purpose),
      redo: () => this.#writes.writeMapping(ref, event, scope, null),
    });
  }

  /**
   * The editor saves title, notes and times together — one write, so one refetch and one undo.
   * `detach` skips the series prompt entirely — see `CalendarDrag.endDrag`.
   */
  async editEvent(
    event: CalendarEvent,
    patch: { title?: string; description?: string; start?: Date; end?: Date },
    detach = false,
  ) {
    this.#series.dismiss();
    const ref = this.#writes.ref(event);
    const before = fieldsOf(event);
    const after: EventFields = {
      title: patch.title ?? before.title,
      description: patch.description ?? before.description,
      start: patch.start ?? before.start,
      end: patch.end ?? before.end,
    };
    // A drag that lands where it started, or an editor closed without a change, is not an edit:
    // nothing is written, and above all nothing is asked about the rest of the series.
    if (sameFields(before, after)) return;
    // A block the calendar hasn't answered for yet has no id to write against, so the edit is
    // drawn where the block already is and sent the moment the create comes back — see `create`.
    if (this.#writes.isDraft(event.id)) {
      this.#draftEdits.set(event.id, after);
      this.#writes.draw(event.id, {
        ...event,
        title: after.title,
        description: after.description,
        start: after.start.toISOString(),
        end: after.end.toISOString(),
      });
      return;
    }
    // Offered before the write goes out, not after it comes back: the edit is already drawn on
    // the grid, so a card that waits for the server arrives long after the question is asked.
    const offer =
      event.seriesId && !detach
        ? this.#series.offer({
            ref,
            seriesId: event.seriesId,
            seriesStart: event.seriesStart,
            title: after.title,
            fields: after,
            previousStart: before.start,
            previousEnd: before.end,
          })
        : null;

    if (!(await this.#writes.writeFields(ref, event, after))) {
      this.#series.withdraw(offer);
      return;
    }

    this.history.push({
      undo: () => this.#writes.writeFields(ref, event, before),
      redo: () => this.#writes.writeFields(ref, event, after),
    });
  }

  retimeEvent(event: CalendarEvent, start: Date, end: Date, detach = false) {
    return this.editEvent(event, { start, end }, detach);
  }

  /**
   * The rest of what a card can change — where it is, its zone, how it repeats, who is coming,
   * its reminders, its call. One write, drawn ahead where it can be; the caller says what the
   * write back would be. A rule always lands on the series' master, since a rule is the series';
   * anything else edited on an occurrence is offered to the rest of the series the way a retitle is.
   */
  async patchEvent(event: CalendarEvent, patch: EventPatch, inverse: EventPatch) {
    this.#series.dismiss();
    if (this.#writes.isDraft(event.id)) {
      diagnostics.report("Calendar", "The block is still being made.", {
        title: "Give it a second",
      });
      return;
    }
    const ref = this.#writes.ref(event);
    const onMaster = event.seriesId && patch.recurrence !== undefined;
    const series = onMaster
      ? {
          seriesId: event.seriesId ?? "",
          previousStart: event.start,
          previousEnd: event.end,
        }
      : {};
    const write = async (fields: EventPatch) => {
      const answer = await this.#writes.run(
        () =>
          updateCalendarEvent(ref.id, {
            calendarId: ref.calendarId,
            ...fields,
            ...series,
          }),
        { id: ref.id, event: drawnWith(event, fields) },
        (answer) => applyCalendarEvent(answer, ref.id),
      );
      // A rule reshapes the whole series — occurrences appear or go on every day it touches — so
      // the weeks on screen are asked again now rather than on the next visit. Undoing one too.
      if (answer !== null && fields.recurrence !== undefined) {
        invalidate.calendar();
        await this.#host.refreshWeeks();
      }
      return answer;
    };
    const offer =
      event.seriesId && !onMaster
        ? this.#series.offer({
            ref,
            seriesId: event.seriesId,
            seriesStart: event.seriesStart,
            title: event.title,
            fields: fieldsOf(event),
            previousStart: new Date(event.start),
            previousEnd: new Date(event.end),
            patch,
          })
        : null;

    if ((await write(patch)) === null) {
      this.#series.withdraw(offer);
      return;
    }

    this.history.push({
      undo: async () => (await write(inverse)) !== null,
      redo: async () => (await write(patch)) !== null,
    });
  }

  /**
   * Who hosts the event: handing it to another calendar is the calendar's own way of changing an
   * organizer, and it is offered wherever the organizer's name is drawn. Everything else about
   * the event stays put — between two accounts it can't, since neither can write the other's
   * calendar, so the far side makes it again and the near one lets it go.
   *
   * Undoing is the same move backwards, run against whatever came back rather than what was
   * there before: a hand-over answers with a different event, and that is the one to send home.
   */
  async moveEventToCalendar(event: CalendarEvent, calendarId: string) {
    if (event.calendarId === calendarId) return;
    if (this.#writes.isDraft(event.id)) {
      diagnostics.report("Calendar", "The block is still being made.", { title: "Give it a second" });
      return;
    }
    this.#series.dismiss();
    const ref = this.#writes.ref(event);
    const from = event.calendarId;
    let current = event;
    const move = async (to: string) => {
      const moved = await this.#writes.moveToCalendar(ref, current, to);
      if (moved) current = moved;
      return moved !== null;
    };

    if (!(await move(calendarId))) return;
    this.history.push({ undo: () => move(from), redo: () => move(calendarId) });
  }

  /**
   * Yes, no or maybe to an invitation. Not an edit of the event — it's the organizer's — but a
   * write like any other: the answer is drawn on the card and the block at once, since a no takes
   * the hour out of its category's total, and it waits its turn in the queue behind whatever
   * else is on its way to this event. Undoable back to the previous answer; an invitation that
   * had never been answered can't be un-answered, so that first reply leaves no step.
   */
  async respondToEvent(event: CalendarEvent, response: Answer) {
    if (this.#writes.isDraft(event.id)) return;
    const ref = this.#writes.ref(event);
    const before = event.response;
    if (before === response) return;
    const write = async (answer: Answer) =>
      (await this.#writes.run(
        () => respondToCalendarEvent(ref.id, ref.calendarId, answer),
        { id: ref.id, event: answered(event, answer) },
        (updated) => applyCalendarEvent(updated, ref.id),
      )) !== null;
    if (!(await write(response))) return;
    if (before === null || before === "needsAction") return;

    this.history.push({
      undo: () => write(before),
      redo: () => write(response),
    });
  }

  /**
   * A one-off goes at once. A recurring occurrence is first asked how much of its series goes
   * with it — unless the caller has already said, or is deleting a gathered batch, where the
   * question would have to be asked once per block and "this one" is what a batch means anyway.
   * Only a single occurrence can be put back: the calendar has no undo for a series.
   */
  async deleteEvent(event: CalendarEvent, scope?: SeriesScope | "instance") {
    this.#series.dismiss();
    this.#series.dismissDelete();
    if (event.seriesId && !scope && !this.#writes.isDraft(event.id)) {
      this.#series.offerDelete(event);
      return;
    }
    this.#selection.deselect();
    const ref = this.#writes.ref(event);
    if (event.seriesId && scope && scope !== "instance") {
      await this.#writes.removeSeries(ref, {
        seriesId: event.seriesId,
        seriesScope: scope,
        occurrenceStart: event.start,
      });
      return;
    }
    const occurrenceOf = event.seriesId ?? undefined;
    if (!(await this.#writes.remove(ref, occurrenceOf))) return;

    this.history.push({
      undo: () => this.#writes.restore(ref, event),
      redo: () => this.#writes.remove(ref, occurrenceOf),
    });
  }

  /** What a whole gathered batch counts as — one category over all of them, in one step. */
  mapEvents(events: readonly CalendarEvent[], weights: ActivityWeight[]) {
    return this.#batch(events.map((event) => this.#mapStep(event, weights)));
  }

  /**
   * A new block has no id until the calendar gives it one, so it's drawn under a made-up one and
   * the real event takes its place when the refetch lands.
   */
  async create(source: DragSource | null, title: string, start: Date, end: Date, openAt: DOMRect | null = null) {
    const activityId = source?.activityId ?? null;
    const activity = activities.all.find((a) => a.id === activityId) ?? null;
    const draft: CalendarEvent = {
      id: this.#writes.draftId(),
      calendarId: this.#host.week.value?.writeCalendarId ?? "",
      seriesId: null,
      seriesStart: null,
      title,
      description: null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      declined: false,
      tentative: false,
      readOnly: false,
      movable: true,
      countsTowardHours: true,
      url: null,
      mappingScope: source ? "instance" : null,
      activityId,
      activityName: activity?.name ?? null,
      weights: activity?.weights ?? source?.weights ?? [],
      ...NOT_A_MEETING,
      projectId: source?.projectId ?? null,
      taskId: source?.taskId ?? null,
    };
    // The handle is taken on the draft, so the editor's writes queue up behind the create against
    // a made-up id and land on the real one — nothing here waits on Google to be usable.
    const ref = this.#writes.ref(draft);
    const selection = this.#selection;
    if (openAt) {
      selection.unnamedId = draft.id;
      selection.select(draft, openAt);
    }

    const created = await this.#writes.run(
      async () => {
        const event = await createCalendarEvent({
          activityId: activityId ?? undefined,
          weights: source && !activityId ? source.weights : undefined,
          projectId: source?.projectId ?? undefined,
          taskId: source?.taskId ?? undefined,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
        });
        // Written before the refetch that takes the draft off the grid, so nothing open on the
        // draft is ever left looking at a block that isn't there — see `CalendarData.selected`.
        if (this.#became.size > BECAME_LIMIT) this.#became.clear();
        this.#became.set(draft.id, event.id);
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        return event;
      },
      { id: draft.id, event: draft },
      (event) => applyCalendarEvent(event, draft.id),
    );
    if (!created) {
      // Nothing was made, so there's nothing to have open — the error says why.
      this.#draftEdits.delete(draft.id);
      if (selection.selectedId === draft.id) selection.deselect();
      return;
    }

    this.#writes.moveRef(ref, created);
    // Whatever was open on the draft moves onto the event the calendar made — the same block as
    // far as the screen is concerned, and now one that can be written to directly.
    if (selection.unnamedId === draft.id) selection.unnamedId = created.id;
    if (selection.selectedId === draft.id) selection.select(created, selection.selectedRect);

    // Whatever was typed into the block while it was a draft, as one write against the real event.
    const edited = this.#draftEdits.get(draft.id);
    this.#draftEdits.delete(draft.id);
    if (edited) void this.#writes.writeFields(ref, created, edited);
    this.history.push({
      undo: () => this.#writes.remove(ref),
      redo: () => this.#writes.restore(ref, created),
    });
  }

  /** Alt-drag on an existing block: a new event with the same fields, dropped at the new time. */
  async #copyEvent(was: CalendarEvent, start: Date, end: Date) {
    const draft: CalendarEvent = {
      ...was,
      id: this.#writes.draftId(),
      seriesId: null,
      seriesStart: null,
      start: start.toISOString(),
      end: end.toISOString(),
    };
    const created = await this.#writes.run(
      async () => {
        const event = await createCalendarEvent({
          ...mappingFieldsOf(was),
          title: was.title,
          description: was.description ?? undefined,
          start: start.toISOString(),
          end: end.toISOString(),
        });
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        return event;
      },
      { id: draft.id, event: draft },
      (event) => applyCalendarEvent(event, draft.id),
    );
    if (!created) return;

    const ref = this.#writes.ref(created);
    this.history.push({
      undo: () => this.#writes.remove(ref),
      redo: () => this.#writes.restore(ref, created),
    });
  }

  /**
   * Every write is drawn on the grid the moment it's asked for — `run` draws before it queues —
   * so a batch of ten lands on screen at once and catches up with the server one write at a time.
   * The step recorded is the whole batch, which is what ⌘Z is expected to take back.
   */
  async #batch(steps: readonly HistoryStep[]) {
    this.#series.dismiss();
    const attempts = await Promise.all(steps.map((step) => step.redo().then((done) => (done ? step : null))));
    const done = attempts.filter((step): step is HistoryStep => step !== null);
    if (done.length === 0) return;

    this.history.push({
      undo: () => runAll(done, "undo"),
      redo: () => runAll(done, "redo"),
    });
  }

  /** One event's move, as a step that runs either way — what a batch is built out of. */
  #retimeStep(event: CalendarEvent, start: Date, end: Date): HistoryStep {
    const ref = this.#writes.ref(event);
    const before = fieldsOf(event);
    const after: EventFields = { ...before, start, end };
    return {
      undo: () => this.#writes.writeFields(ref, event, before),
      redo: () => this.#writes.writeFields(ref, event, after),
    };
  }

  /** One event's mapping, as a step that runs either way — see `mapEvent` for the single case. */
  #mapStep(event: CalendarEvent, weights: ActivityWeight[]): HistoryStep {
    const ref = this.#writes.ref(event);
    const before = mappingOf(event);
    return {
      undo: async () =>
        (await this.#writes.writeMapping(ref, event, "instance", null)) &&
        (before ? this.#writes.writeMapping(ref, event, before.scope, before.choice, before.purpose) : true),
      redo: () => this.#writes.writeMapping(ref, event, "instance", { weights }),
    };
  }
}

/** The event's editable fields as they stand, in the shape a write takes. */
function fieldsOf(event: CalendarEvent): EventFields {
  return {
    title: event.title,
    description: event.description,
    start: new Date(event.start),
    end: new Date(event.end),
  };
}

/** Every write of a batch at once; the answer is whether all of them landed. */
async function runAll(steps: readonly HistoryStep[], which: "undo" | "redo") {
  const results = await Promise.all(steps.map((step) => step[which]()));
  return results.every(Boolean);
}
