import { beforeEach, describe, expect, it, vi } from "vitest";
import { IcsImport } from "./ics-import.svelte";
import { createCalendarEvent, saveEventMapping } from "./queries";

// Only the two writes an import makes: the rest of the module is what the store is built out of,
// and mocking it away would take the store with it.
vi.mock("$lib/calendar/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/calendar/queries")>()),
  createCalendarEvent: vi.fn(),
  saveEventMapping: vi.fn(),
}));

const created = vi.mocked(createCalendarEvent);
const mapped = vi.mocked(saveEventMapping);

beforeEach(() => {
  vi.resetAllMocks();
  created.mockImplementation(async (input) => ({ id: "made", calendarId: input.calendarId ?? "primary" }) as never);
  mapped.mockResolvedValue(undefined as never);
});

/** A file of `count` events, so a run has something to spread across several writes at once. */
function calendarOf(count: number) {
  const events = Array.from({ length: count }, (_, i) =>
    [
      "BEGIN:VEVENT",
      `UID:${i}@example.com`,
      `SUMMARY:Event ${i}`,
      "DTSTART:20260824T090000Z",
      "DTEND:20260824T091500Z",
      "END:VEVENT",
    ].join("\r\n"),
  );
  return ["BEGIN:VCALENDAR", ...events, "END:VCALENDAR"].join("\r\n");
}

const CALENDAR = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:one@example.com",
  "SUMMARY:Standup",
  "DTSTART:20260824T090000Z",
  "DTEND:20260824T091500Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function drop(name: string, text: string, type = "text/calendar") {
  return new File([text], name, { type });
}

describe("a file dropped on the window", () => {
  it("opens the sheet with everything in the file ticked", async () => {
    const ics = new IcsImport();
    await ics.receiveFile(drop("invite.ics", CALENDAR));

    expect(ics.open).toBe(true);
    expect(ics.fileName).toBe("invite.ics");
    expect(ics.error).toBeNull();
    expect(ics.candidates.map((c) => c.event.title)).toEqual(["Standup"]);
    expect(ics.selectedCount).toBe(1);
  });

  // A `.ics` served as `application/octet-stream` is still a calendar, and a `.txt` full of
  // calendar text is still not one anybody meant to import.
  it("goes by the extension when the browser has no type to offer", async () => {
    const ics = new IcsImport();
    await ics.receiveFile(drop("timetable.ICS", CALENDAR, ""));
    expect(ics.candidates).toHaveLength(1);
  });

  it("says so rather than silently doing nothing when the file isn't a calendar", async () => {
    const ics = new IcsImport();
    await ics.receiveFile(drop("photo.png", "not a calendar", "image/png"));

    expect(ics.open).toBe(true);
    expect(ics.candidates).toEqual([]);
    expect(ics.error).toBe("That isn't a calendar file.");
  });

  it("says a calendar file holding no events holds no events", async () => {
    const ics = new IcsImport();
    await ics.receiveFile(drop("empty.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR"));
    expect(ics.error).toBe("There are no events in that file.");
    expect(ics.candidates).toEqual([]);
  });

  it("forgets the file when the sheet is dismissed", async () => {
    const ics = new IcsImport();
    await ics.receiveFile(drop("invite.ics", CALENDAR));
    ics.dismiss();
    expect(ics.open).toBe(false);
    expect(ics.candidates).toEqual([]);
  });
});

describe("what the import is pointed at", () => {
  async function ready() {
    const ics = new IcsImport();
    await ics.receiveFile(drop("invite.ics", CALENDAR));
    return ics;
  }

  it("writes into the chosen calendar and maps to the chosen category", async () => {
    const ics = await ready();
    ics.calendarId = "work@example.com";
    ics.categoryId = "deep-work";
    await ics.import();

    expect(created).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "work@example.com" }));
    expect(mapped).toHaveBeenCalledWith({
      calendarId: "work@example.com",
      externalEventId: "made",
      scope: "instance",
      weights: [{ categoryId: "deep-work", weightPercent: 100 }],
    });
    expect(ics.imported).toBe(1);
  });

  it("leaves both to the server when neither was chosen", async () => {
    const ics = await ready();
    await ics.import();

    expect(created).toHaveBeenCalledWith(expect.objectContaining({ calendarId: undefined }));
    expect(mapped).not.toHaveBeenCalled();
  });

  // The event is in the calendar by the time the mapping is written, so importing again would
  // leave two of it — the row has to be gone whether or not the second half worked.
  it("counts an event whose mapping failed, so a retry can't duplicate it", async () => {
    const ics = await ready();
    ics.categoryId = "deep-work";
    mapped.mockRejectedValue(new Error("Mapping refused"));
    await ics.import();

    expect(ics.error).toBe("Mapping refused");
    expect(ics.imported).toBe(1);
    expect(ics.candidates).toEqual([]);
  });

  it("forgets both choices when the sheet is dismissed", async () => {
    const ics = await ready();
    ics.calendarId = "work@example.com";
    ics.categoryId = "deep-work";
    ics.dismiss();
    expect(ics.calendarId).toBeNull();
    expect(ics.categoryId).toBeNull();
  });
});

describe("a run of many events", () => {
  /** Resolves nothing until it is told to, so a run can be caught with writes still in the air. */
  function held() {
    const releases: (() => void)[] = [];
    let live = 0;
    let peak = 0;
    const call = () => {
      live += 1;
      peak = Math.max(peak, live);
      return new Promise<void>((resolve) =>
        releases.push(() => {
          live -= 1;
          resolve();
        }),
      );
    };
    return { call, releases, peak: () => peak };
  }

  it("writes several at once rather than one after another", async () => {
    const gate = held();
    created.mockImplementation(async () => {
      await gate.call();
      return { id: "made", calendarId: "primary" } as never;
    });

    const ics = new IcsImport();
    await ics.receiveFile(drop("term.ics", calendarOf(12)));
    let finished = false;
    const run = ics.import().then(() => (finished = true));

    // Everything the pool can hold is in flight before any of it has come back.
    await vi.waitFor(() => expect(gate.releases).toHaveLength(5));
    expect(ics.progress).toEqual({ done: 0, total: 12 });

    while (!finished) {
      for (const release of gate.releases.splice(0)) release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await run;

    expect(created).toHaveBeenCalledTimes(12);
    expect(gate.peak()).toBe(5);
    expect(ics.imported).toBe(12);
    expect(ics.progress).toBeNull();
    expect(ics.candidates).toEqual([]);
  });

  it("keeps the rows it never wrote when one of them fails", async () => {
    created.mockImplementation(async (input) => {
      if (input.title === "Event 1") throw new Error("Google said no");
      return { id: "made", calendarId: "primary" } as never;
    });

    const ics = new IcsImport();
    await ics.receiveFile(drop("term.ics", calendarOf(12)));
    await ics.import();

    expect(ics.error).toBe("Google said no");
    // The failure stops anything else starting, so what is left is what was never attempted —
    // and every row still listed is one the calendar has never seen.
    expect(ics.candidates.some((candidate) => candidate.event.title === "Event 1")).toBe(true);
    expect(ics.candidates.length).toBe(12 - (ics.imported ?? 0));
    expect(created).toHaveBeenCalledTimes(12 - ics.candidates.length + 1);
  });

  it("does nothing at all when nothing is ticked", async () => {
    const ics = new IcsImport();
    await ics.receiveFile(drop("term.ics", calendarOf(3)));
    ics.toggleAll(false);
    await ics.import();

    expect(created).not.toHaveBeenCalled();
    expect(ics.progress).toBeNull();
    expect(ics.candidates).toHaveLength(3);
  });
});
