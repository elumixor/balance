import { registerPlugin } from "@capacitor/core";
import { type IcsEvent, parseIcs } from "$lib/ics";
import { createCalendarEvent } from "$lib/queries";
import { invalidate } from "$lib/store.svelte";
import { isIOSApp } from "$lib/mobile/platform";

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

export class IcsImport {
  /** The file being looked at, or null when the sheet is closed. */
  fileName = $state<string | null>(null);
  candidates = $state<ImportCandidate[]>([]);
  importing = $state(false);
  error = $state<string | null>(null);
  /** What the last import did, kept until the sheet is dismissed. */
  imported = $state<number | null>(null);

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
   * Writes the ticked events into the calendar, one at a time — a file of forty events fired at
   * Google at once is what its rate limiter is for, and the count that comes back has to be true.
   * A failure stops the run and says how far it got, so pressing the button again after fixing
   * the connection doesn't duplicate what already landed.
   */
  async import() {
    if (this.importing) return;
    this.importing = true;
    this.error = null;
    let done = 0;

    try {
      for (const { event } of this.candidates.filter((c) => c.selected)) {
        await createCalendarEvent({
          title: event.title || "Untitled",
          description: event.description ?? undefined,
          location: event.location ?? undefined,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
          allDay: event.allDay,
        });
        done += 1;
      }
      this.candidates = [];
      this.imported = done;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Something went wrong importing that file";
      // Whatever did land drops out of the list, so pressing the button again writes only the rest.
      let landed = done;
      this.candidates = this.candidates.filter((candidate) => {
        if (!candidate.selected || landed === 0) return true;
        landed -= 1;
        return false;
      });
      this.imported = done > 0 ? done : null;
    } finally {
      this.importing = false;
      if (done > 0) invalidate.calendar();
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
      this.error = "That isn't a calendar file.";
      return;
    }
    try {
      this.receive({ name: file.name, content: await file.text() });
    } catch (e) {
      this.fileName = file.name;
      this.candidates = [];
      this.imported = null;
      this.error = e instanceof Error ? e.message : "That file wouldn't open.";
    }
  }

  receive(file: IncomingFile) {
    const events = parseIcs(file.content);
    this.fileName = file.name;
    this.error = events.length === 0 ? "There are no events in that file." : null;
    this.imported = null;
    this.candidates = events.map((event, index) => ({
      key: `${event.uid ?? "event"}:${index}`,
      event,
      selected: true,
    }));
  }
}

export const icsImport = new IcsImport();
