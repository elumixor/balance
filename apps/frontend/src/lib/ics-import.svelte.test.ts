import { describe, expect, it } from "vitest";
import { IcsImport } from "./ics-import.svelte";

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
