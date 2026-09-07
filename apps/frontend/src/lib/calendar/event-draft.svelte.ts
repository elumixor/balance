import { formatClock, formatDateInput, formatHoursAndMinutes, parseDateAndClock } from "$lib/ui/format";
import type { CalendarEvent } from "./types";

/** How long after the last keystroke the edit goes to the calendar. */
export const SAVE_DELAY_MS = 700;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** The fields the card types into, as the calendar takes them. */
export interface EventFields {
  readonly title: string;
  readonly description: string;
  readonly start: Date;
  readonly end: Date;
}

/** Where a block is drawn on the grid while a time field is still deciding. */
export interface EventPreview {
  readonly id: string;
  readonly start: string;
  readonly end: string;
}

/** What the draft asks of the calendar — named so a test can stand in for it. */
export interface DraftCalendar {
  /** The event a draft turned into, for whatever was open on it — null for any other id. */
  becameId(id: string): string | null;
  editEvent(event: CalendarEvent, fields: EventFields): Promise<unknown>;
  /** A sentence for the card in the corner, with what actually failed behind it. */
  report(title: string, error: unknown): void;
}

/** What the calendar last agreed to, so an unchanged field never costs a write. */
interface Saved {
  readonly title: string;
  readonly notes: string;
  readonly start: number;
  readonly end: number;
}

export function samePreview(a: EventPreview | null, b: EventPreview | null) {
  return a?.id === b?.id && a?.start === b?.start && a?.end === b?.end;
}

/**
 * The card's own copy of what it is typing into an event, and how that reaches the calendar.
 *
 * Nothing here has a Save button: every keystroke queues a write that goes a moment after the
 * typing stops, and whatever is still pending is written when the card closes. The draft is
 * reloaded when another block is selected — but not when the calendar merely gives the block
 * being typed into its real id, which would put the server's version of a half-typed name back.
 */
export class EventDraft {
  title = $state("");
  notes = $state("");
  date = $state("");
  from = $state("");
  to = $state("");
  /**
   * What a time field is currently pointing at, while it's being used — the block on the grid is
   * drawn at that size before anything is written, so a walked-to suggestion can be seen as well
   * as read. Null the rest of the time, which leaves the grid to say what the week holds.
   */
  previewFrom = $state<string | null>(null);
  previewTo = $state<string | null>(null);

  #event = $state.raw<CalendarEvent | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;
  #saved: Saved = { title: "", notes: "", start: 0, end: 0 };
  #loaded = "";
  /** A deleted event must not be written back by the pending edit the card is unmounting with. */
  #deleted = false;
  readonly #calendar: DraftCalendar;

  constructor(calendar: DraftCalendar) {
    this.#calendar = calendar;
  }

  /** Whether the words and times can be changed from here at all. */
  get editable() {
    const event = this.#event;
    return Boolean(event?.movable && !event.allDay);
  }

  /** The span the two clock fields describe, shown beside them the way the calendar shows it. */
  readonly span = $derived.by(() => {
    const range = this.parseRange();
    return range ? formatHoursAndMinutes((range.end.getTime() - range.start.getTime()) / MS_PER_HOUR) : "";
  });

  /** Where the block would land if the time field being used were taken at its word. */
  readonly preview = $derived.by((): EventPreview | null => {
    const event = this.#event;
    if (!event || !(this.previewFrom || this.previewTo)) return null;
    const range = this.parseRange(this.previewFrom ?? this.from, this.previewTo ?? this.to);
    return range ? { id: event.id, start: range.start.toISOString(), end: range.end.toISOString() } : null;
  });

  /**
   * Takes the event's fields, unless it is the block already being typed into. True when the
   * fields were replaced, so whatever was open over the old ones can be put away.
   */
  load(event: CalendarEvent) {
    this.#event = event;
    if (this.#loaded === event.id) return false;
    const carriedOver = this.#calendar.becameId(this.#loaded) === event.id;
    this.#loaded = event.id;
    if (carriedOver) return false;
    this.previewFrom = null;
    this.previewTo = null;
    this.title = event.title;
    this.notes = event.description ?? "";
    this.date = formatDateInput(new Date(event.start));
    this.from = formatClock(new Date(event.start));
    this.to = formatClock(new Date(event.end));
    this.#saved = {
      title: event.title,
      notes: event.description ?? "",
      start: new Date(event.start).getTime(),
      end: new Date(event.end).getTime(),
    };
    return true;
  }

  parseRange(fromClock = this.from, toClock = this.to) {
    const start = parseDateAndClock(this.date, fromClock);
    const end = parseDateAndClock(this.date, toClock);
    if (!start || !end) return null;
    // A block that ends before it starts ran past midnight.
    return { start, end: end <= start ? new Date(end.getTime() + MS_PER_DAY) : end };
  }

  queue() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#commit(), SAVE_DELAY_MS);
  }

  /** A pending edit still belongs to the user: it goes now rather than after the delay. */
  flush() {
    if (!this.#timer || this.#deleted) return;
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#commit();
  }

  /** Whatever has been typed since the last write is dropped: the fields go back to what was saved. */
  revert() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const saved = this.#saved;
    this.title = saved.title;
    this.notes = saved.notes;
    this.date = formatDateInput(new Date(saved.start));
    this.from = formatClock(new Date(saved.start));
    this.to = formatClock(new Date(saved.end));
  }

  /** The event is going: whatever was queued for it must not be written back. */
  discard() {
    this.#deleted = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Adds a line to the notes and writes it at once — a pasted call link has nothing more to type. */
  append(line: string) {
    this.notes = this.notes.trim() ? `${this.notes.trimEnd()}\n\n${line}` : line;
    this.#commit();
  }

  /** A write the calendar might refuse: the refusal reaches the card in the corner, not the console. */
  async write(title: string, write: Promise<unknown>) {
    try {
      await write;
    } catch (e) {
      this.#calendar.report(title, e);
    }
  }

  /** Writes only what actually moved; an unparseable time is said once and left alone. */
  #commit() {
    this.#timer = null;
    const event = this.#event;
    if (!event || !this.editable) return;
    const range = this.parseRange();
    if (!range) {
      this.#calendar.report("Check the date and times", "Check the date and times.");
      return;
    }
    const next = {
      title: this.title.trim(),
      notes: this.notes,
      start: range.start.getTime(),
      end: range.end.getTime(),
    };
    const saved = this.#saved;
    if (
      next.title === saved.title &&
      next.notes === saved.notes &&
      next.start === saved.start &&
      next.end === saved.end
    ) {
      return;
    }
    // The write draws itself on the grid before it asks the server, so nothing here waits on the
    // network to look done — only the error, if one comes back, arrives late.
    this.#saved = next;
    void this.write(
      "The edit wasn’t saved",
      this.#calendar.editEvent(event, {
        title: next.title,
        description: next.notes,
        start: range.start,
        end: range.end,
      }),
    );
  }
}
