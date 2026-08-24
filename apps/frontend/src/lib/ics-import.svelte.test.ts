import { beforeEach, describe, expect, it, vi } from "vitest";
import { IcsImport } from "./ics-import.svelte";
import { createCalendarEvent, saveEventMapping } from "./queries";

// Only the two writes an import makes: the rest of the module is what the store is built out of,
// and mocking it away would take the store with it.
vi.mock("./queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queries")>()),
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
