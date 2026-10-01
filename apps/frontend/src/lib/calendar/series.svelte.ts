import { invalidate } from "$lib/core/store.svelte";
import type { EventFields } from "./purpose";
import { type EventPatch, updateCalendarEvent } from "./queries";
import type { CalendarEvent, SeriesScope } from "./types";
import type { CalendarWrites, Drawn, EventRef } from "./writes.svelte";

/**
 * A recurring event was just edited on this occurrence alone — offered up in case the change was
 * meant for every occurrence. Holding ⌘/Ctrl through a drag skips this and detaches the occurrence
 * on purpose, which is why the prompt only ever appears after a write that didn't ask for that.
 *
 * Edits to the same occurrence gather into one offer: a card open on it is a sitting of several
 * changes — guests, a call, a new time — and the question is asked once, about all of them, when
 * the card closes (`CalendarData.seriesPrompt` holds it back until then).
 */
export interface SeriesPrompt {
  /** Bumped per offer, so another event's edit is a new card rather than the old one relabelled. */
  readonly id: number;
  /** The occurrence as the grid knows it — what an open card is matched against. */
  readonly eventId: string;
  readonly ref: EventRef;
  readonly seriesId: string;
  readonly seriesStart: string | null;
  readonly title: string;
  readonly fields: EventFields;
  /** Where the occurrence stood before the first gathered edit — what the server moves the rest by. */
  readonly previousStart: Date;
  readonly previousEnd: Date;
  /** The rest of what a card changes — a place, a guest list — when that is what was edited. */
  readonly patch?: EventPatch;
  /** How many writes were gathered, so taking the offer back takes all of them back. */
  readonly steps: number;
}

/** A gathered offer as the one write that `apply` sends series-wide. */
function patchOf(prompt: Omit<SeriesPrompt, "id" | "steps">): EventPatch {
  return (
    prompt.patch ?? {
      title: prompt.fields.title,
      description: prompt.fields.description ?? "",
      start: prompt.fields.start.toISOString(),
      end: prompt.fields.end.toISOString(),
    }
  );
}

/**
 * A recurring event about to be deleted. Unlike an edit, nothing has happened yet: a series is
 * not something the app can put back, so the question comes before the write, not after it.
 */
export interface DeletePrompt {
  readonly id: number;
  readonly event: CalendarEvent;
}

export interface SeriesHost {
  /** The events as shown, so a series-wide write can be drawn on every occurrence it reaches. */
  readonly events: readonly CalendarEvent[];
  refreshWeeks(): Promise<unknown>;
}

/** The "how much of the series?" question — asked after an edit, and before a delete. */
export class CalendarSeries {
  /** A just-edited recurring occurrence, offered the choice to apply the same edit series-wide. */
  prompt = $state<SeriesPrompt | null>(null);
  /** A recurring occurrence waiting to hear how much of its series goes with it. */
  deletePrompt = $state<DeletePrompt | null>(null);
  #offers = 0;
  readonly #writes: CalendarWrites;
  readonly #host: SeriesHost;

  constructor(writes: CalendarWrites, host: SeriesHost) {
    this.#writes = writes;
    this.#host = host;
  }

  /**
   * A second edit to the occurrence already on offer joins it — the latest name, notes and time,
   * every patched field, and the place it stood before the first. Another occurrence's edit is
   * its own card — see `SeriesPrompt.id`.
   */
  offer(prompt: Omit<SeriesPrompt, "id" | "steps">) {
    const was = this.prompt;
    const offered: SeriesPrompt =
      was && was.eventId === prompt.eventId && was.seriesId === prompt.seriesId
        ? {
            ...prompt,
            id: was.id,
            previousStart: was.previousStart,
            previousEnd: was.previousEnd,
            patch: { ...patchOf(was), ...patchOf(prompt) },
            steps: was.steps + 1,
          }
        : { ...prompt, id: ++this.#offers, steps: 1 };
    this.prompt = offered;
    return offered;
  }

  /**
   * The write it was asking about never landed, so neither does the question — a gathered one
   * included, since what it would send series-wide is no longer what the occurrence holds.
   */
  withdraw(offer: SeriesPrompt | null) {
    if (offer && this.prompt?.id === offer.id) this.prompt = null;
  }

  /** Just this occurrence, then — the write already happened, so there's nothing left to do. */
  dismiss() {
    this.prompt = null;
  }

  /** Another block is being changed: an offer about this one is answered "just this occurrence". */
  dismissUnless(eventId: string) {
    if (this.prompt && this.prompt.eventId !== eventId) this.prompt = null;
  }

  offerDelete(event: CalendarEvent) {
    this.deletePrompt = { event, id: ++this.#offers };
  }

  /** The delete that was never confirmed never happens. */
  dismissDelete() {
    this.deletePrompt = null;
  }

  /**
   * The offered series-wide write actually goes out — over every occurrence, or over this one and
   * the ones after it, which the server answers by cutting the series in two.
   */
  async apply(scope: SeriesScope = "all") {
    const prompt = this.prompt;
    if (!prompt) return;
    this.prompt = null;
    const fields = patchOf(prompt);
    await this.#writes.run(
      () =>
        updateCalendarEvent(prompt.ref.id, {
          calendarId: prompt.ref.calendarId,
          ...fields,
          seriesId: prompt.seriesId,
          seriesScope: scope,
          previousStart: prompt.previousStart.toISOString(),
          previousEnd: prompt.previousEnd.toISOString(),
        }),
      this.#reach(prompt, scope, fields),
    );
    // A rule reshapes the whole series, and a cut makes a new one: the weeks are asked again
    // rather than patched by hand.
    if (prompt.patch?.recurrence !== undefined || scope === "following") {
      invalidate.calendar();
      await this.#host.refreshWeeks();
    }
  }

  /**
   * The same change drawn on every occurrence the answer reaches, before the server has moved a
   * single one: a new time moves each by as much as the edited one moved, and a new name, notes
   * or place lands on all of them as it was typed. What the strip doesn't hold — a rule, the
   * guest list, occurrences on weeks not loaded — waits for the refetch.
   */
  #reach(prompt: SeriesPrompt, scope: SeriesScope, fields: EventPatch): Drawn[] {
    const from = prompt.previousStart.getTime();
    const shiftStart = fields.start ? new Date(fields.start).getTime() - from : 0;
    const shiftEnd = fields.end ? new Date(fields.end).getTime() - prompt.previousEnd.getTime() : 0;
    return this.#host.events
      .filter(
        (event) =>
          event.id !== prompt.ref.id &&
          event.seriesId === prompt.seriesId &&
          (scope === "all" || new Date(event.start).getTime() >= from),
      )
      .map((event) => ({
        id: event.id,
        event: {
          ...event,
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.description !== undefined ? { description: fields.description || null } : {}),
          ...(fields.location !== undefined ? { location: fields.location || null } : {}),
          start: new Date(new Date(event.start).getTime() + shiftStart).toISOString(),
          end: new Date(new Date(event.end).getTime() + shiftEnd).toISOString(),
        },
      }));
  }
}
