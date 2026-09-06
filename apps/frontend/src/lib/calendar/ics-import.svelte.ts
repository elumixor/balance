import { registerPlugin } from "@capacitor/core";
import { invalidate } from "$lib/core/store.svelte";
import { isIOSApp } from "$lib/mobile/platform";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { type IcsEvent, parseIcs } from "./ics";
import { createCalendarEvent, saveEventMapping } from "./queries";

/**
 * Importing an `.ics` file the app was given — an invitation from Mail, a timetable downloaded in
 * Safari, a season's fixtures from a club's website. The phone is handed one by iOS; the Mac and
 * a browser tab are handed one by dropping it on the window (`IcsDropZone.svelte`).
 *
 * iOS hands the file to the app itself rather than to a share extension: the events are written
 * into Google Calendar through the same API the rest of the app writes with, and that needs the
 * Clerk session, which lives in this webview and nowhere else. A separate extension process would
 * have to be given a second copy of the session to do the same work — see `IcsImportPlugin.swift`,
 * which is only the delivery.
 *
 * Nothing is imported without being looked at. The file decides nothing on its own: it opens a
 * sheet listing what it contains, everything ticked, and the person holding the phone unticks the
 * three-hour bus journey before pressing the button.
 */

interface IcsImportPlugin {
  /** Anything handed over before the webview was listening — a file is what launched the app. */
  pending(): Promise<{ files: IncomingFile[] }>;
  addListener(event: "icsReceived", handler: (file: IncomingFile) => void): Promise<{ remove: () => Promise<void> }>;
}

export interface IncomingFile {
  readonly name: string;
  readonly content: string;
}

const plugin = registerPlugin<IcsImportPlugin>("IcsImport");

/** One event in the sheet: what the file said, and whether it is going to be imported. */
export interface ImportCandidate {
  readonly key: string;
  readonly event: IcsEvent;
  selected: boolean;
}

/**
 * How many events are written at once. The writes are round trips to Google and spend nearly all
 * of their time waiting, so doing them one at a time made a forty-event timetable take about as
 * long as forty events take — but a whole file fired at once is what a rate limiter is for.
 */
const CONCURRENCY = 5;

export class IcsImport {
  /** The file being looked at, or null when the sheet is closed. */
  fileName = $state<string | null>(null);
  candidates = $state<ImportCandidate[]>([]);
  importing = $state(false);
  /** How far the run has got, for the bar the sheet draws. Null when nothing is being written. */
  progress = $state<{ done: number; total: number } | null>(null);
  /** What went wrong, for the tests and for the one card — never drawn by the sheet itself. */
  error = $state<string | null>(null);
  /** What the last import did, kept until the sheet is dismissed. */
  imported = $state<number | null>(null);
  /**
   * Where the events are going, and what they will count as. Both are decided once for the whole
   * file rather than per event: a file is a timetable or a season's fixtures, and forty rows each
   * with their own two pickers is a form, not a sheet.
   *
   * The calendar defaults to the one new events already land in, and the category to none at all
   * — an unmapped event still draws on the week, and guessing wrong is worse than leaving it.
   */
  calendarId = $state<string | null>(null);
  categoryId = $state<string | null>(null);

  #stop: (() => void) | null = null;

  readonly selectedCount = $derived(this.candidates.filter((c) => c.selected).length);
  readonly open = $derived(this.fileName !== null);

  /**
   * Starts listening for files. Both halves matter: a file shared into a running app arrives as
   * the event, and one that launched the app arrived before this listener existed — the native
   * side holds those until they are asked for.
   */
  start() {
    if (!isIOSApp || this.#stop) return;

    let removeListener: (() => Promise<void>) | null = null;
    let stopped = false;
    void (async () => {
      try {
        const handle = await plugin.addListener("icsReceived", (file) => this.receive(file));
        if (stopped) return void handle.remove();
        removeListener = () => handle.remove();
        const { files } = await plugin.pending();
        for (const file of files) this.receive(file);
      } catch (e) {
        console.warn("[ics] couldn't listen for shared files", e);
      }
    })();

    this.#stop = () => {
      stopped = true;
      void removeListener?.();
    };
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  dismiss() {
    this.fileName = null;
    this.candidates = [];
    this.error = null;
    this.imported = null;
    this.calendarId = null;
    this.categoryId = null;
  }

  toggle(key: string) {
    for (const candidate of this.candidates) {
      if (candidate.key === key) candidate.selected = !candidate.selected;
    }
  }

  toggleAll(selected: boolean) {
    for (const candidate of this.candidates) candidate.selected = selected;
  }

  /**
   * Writes the ticked events into the calendar, a few at a time. The count that comes back has to
   * be true, so an event counts as imported the moment the calendar has it — the mapping written
   * straight after can fail on its own, and an event that is already there must not be written a
   * second time by pressing the button again.
   *
   * The first failure stops anything else being started, but not what is already in the air: a
   * write that has left cannot be taken back, and pretending otherwise is what would duplicate it.
   */
  async import() {
    if (this.importing) return;
    const queue = this.candidates.filter((candidate) => candidate.selected);
    if (queue.length === 0) return;

    this.importing = true;
    this.error = null;
    this.progress = { done: 0, total: queue.length };

    /** The keys of the events the calendar has taken — the rows that must not be offered again. */
    const landed = new Set<string>();
    let failure: string | null = null;
    let next = 0;
    let done = 0;

    const worker = async () => {
      while (next < queue.length && !failure) {
        const candidate = queue[next++];
        try {
          await this.#write(candidate, landed);
        } catch (e) {
          failure ??= e instanceof Error ? e.message : "Something went wrong importing that file";
        } finally {
          done += 1;
          this.progress = { done, total: queue.length };
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    } finally {
      // Whatever landed drops out of the list, so pressing the button again writes only the rest.
      this.candidates = this.candidates.filter((candidate) => !landed.has(candidate.key));
      this.#fail(failure);
      this.imported = landed.size > 0 ? landed.size : null;
      this.importing = false;
      this.progress = null;
      if (landed.size > 0) invalidate.calendar();
    }
  }

  /** One event: into the calendar, and then into whatever it counts as. */
  async #write(candidate: ImportCandidate, landed: Set<string>) {
    const { event } = candidate;
    const created = await createCalendarEvent({
      title: event.title || "Untitled",
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
      calendarId: this.calendarId ?? undefined,
    });
    landed.add(candidate.key);
    if (this.categoryId) {
      await saveEventMapping({
        calendarId: created.calendarId,
        externalEventId: created.id,
        scope: "instance",
        weights: [{ categoryId: this.categoryId, weightPercent: 100 }],
      });
    }
  }

  /**
   * A file picked up from the desktop rather than from iOS. Read here rather than by whatever
   * caught the drop, so a dropped file and a shared one open the same sheet the same way — and
   * anything that isn't a calendar says so in it, instead of vanishing silently.
   */
  async receiveFile(file: File) {
    if (!/\.ics$/i.test(file.name) && file.type !== "text/calendar") {
      this.fileName = file.name;
      this.candidates = [];
      this.imported = null;
      this.#fail("That isn't a calendar file.");
      return;
    }
    try {
      this.receive({ name: file.name, content: await file.text() });
    } catch (e) {
      this.fileName = file.name;
      this.candidates = [];
      this.imported = null;
      this.#fail(e instanceof Error ? e.message : "That file wouldn't open.", e);
    }
  }

  /** Says it once, in the one place the app says these things, and keeps it for whoever asks. */
  #fail(message: string | null, error?: unknown) {
    this.error = message;
    if (message) diagnostics.report("Import", error ?? message, { title: message.replace(/\.$/, "") });
  }

  receive(file: IncomingFile) {
    const events = parseIcs(file.content);
    this.fileName = file.name;
    this.#fail(events.length === 0 ? "There are no events in that file." : null);
    this.imported = null;
    this.candidates = events.map((event, index) => ({
      key: `${event.uid ?? "event"}:${index}`,
      event,
      selected: true,
    }));
  }
}

export const icsImport = new IcsImport();
