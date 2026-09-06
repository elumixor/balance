import { invalidate } from "$lib/core/store.svelte";
import type { EventFields } from "./purpose";
import { type EventPatch, updateCalendarEvent } from "./queries";
import type { CalendarWrites, EventRef } from "./writes.svelte";

/**
 * A recurring event was just edited on this occurrence alone — offered up in case the change was
 * meant for every occurrence. Holding ⌘/Ctrl through a drag skips this and detaches the occurrence
 * on purpose, which is why the prompt only ever appears after a write that didn't ask for that.
 */
export interface SeriesPrompt {
  /** Bumped per offer, so a second edit's card is a new card rather than the old one relabelled. */
  readonly id: number;
  readonly ref: EventRef;
  readonly seriesId: string;
  readonly title: string;
  readonly fields: EventFields;
  readonly previousStart: Date;
  readonly previousEnd: Date;
  /** The rest of what a card changes — a place, a guest list — when that is what was edited. */
  readonly patch?: EventPatch;
}

export interface SeriesHost {
  refreshWeeks(): Promise<unknown>;
}

/** The "apply to the whole series?" question, and the write that answers yes. */
export class CalendarSeries {
  /** A just-edited recurring occurrence, offered the choice to apply the same edit series-wide. */
  prompt = $state<SeriesPrompt | null>(null);
  #offers = 0;
  readonly #writes: CalendarWrites;
  readonly #host: SeriesHost;

  constructor(writes: CalendarWrites, host: SeriesHost) {
    this.#writes = writes;
    this.#host = host;
  }

  /** Every offer is its own card — see `SeriesPrompt.id`. */
  offer(prompt: Omit<SeriesPrompt, "id">) {
    const offered: SeriesPrompt = { ...prompt, id: ++this.#offers };
    this.prompt = offered;
    return offered;
  }

  /** The write it was asking about never landed, so neither does the question. */
  withdraw(offer: SeriesPrompt | null) {
    if (offer && this.prompt?.id === offer.id) this.prompt = null;
  }

  /** Just this occurrence, then — the write already happened, so there's nothing left to do. */
  dismiss() {
    this.prompt = null;
  }

  /** The offered series-wide write actually goes out. */
  async apply() {
    const prompt = this.prompt;
    if (!prompt) return;
    this.prompt = null;
    const fields = prompt.patch ?? {
      title: prompt.fields.title,
      description: prompt.fields.description ?? "",
      start: prompt.fields.start.toISOString(),
      end: prompt.fields.end.toISOString(),
    };
    await this.#writes.run(() =>
      updateCalendarEvent(prompt.ref.id, {
        calendarId: prompt.ref.calendarId,
        ...fields,
        seriesId: prompt.seriesId,
        previousStart: prompt.previousStart.toISOString(),
        previousEnd: prompt.previousEnd.toISOString(),
      }),
    );
    // A rule reshapes the whole series: the week is asked again rather than patched by hand.
    if (prompt.patch?.recurrence !== undefined) {
      invalidate.calendar();
      await this.#host.refreshWeeks();
    }
  }
}
