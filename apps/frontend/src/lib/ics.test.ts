import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";

/** The wrapper every real file has around its events, and none of the tests care about. */
function calendar(...body: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...body, "END:VCALENDAR"].join("\r\n");
}

function vevent(...lines: string[]) {
  return calendar("BEGIN:VEVENT", ...lines, "END:VEVENT");
}

/** One event, or a failure that says which file produced none. */
function only(text: string) {
  const events = parseIcs(text);
  expect(events).toHaveLength(1);
  return events[0];
}

describe("parseIcs", () => {
  it("reads the fields an event on the grid can hold", () => {
    const event = only(
      vevent(
        "UID:abc-123",
        "SUMMARY:Standup",
        "DESCRIPTION:Daily",
        "LOCATION:Room 4",
        "DTSTART:20260824T070000Z",
        "DTEND:20260824T073000Z",
      ),
    );

    expect(event).toEqual({
      uid: "abc-123",
      title: "Standup",
      description: "Daily",
      location: "Room 4",
      start: new Date("2026-08-24T07:00:00Z"),
      end: new Date("2026-08-24T07:30:00Z"),
      allDay: false,
      recurring: false,
    });
  });

  it("finds every event in the file, in the order it lists them", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "SUMMARY:First",
        "DTSTART:20260824T070000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:Second",
        "DTSTART:20260825T070000Z",
        "END:VEVENT",
      ),
    );
    expect(events.map((e) => e.title)).toEqual(["First", "Second"]);
  });

  it("has nothing to say about a file with no events in it", () => {
    expect(parseIcs(calendar("BEGIN:VTODO", "SUMMARY:Not an event", "END:VTODO"))).toEqual([]);
    expect(parseIcs("")).toEqual([]);
  });

  describe("the line format", () => {
    it("puts a folded line back together", () => {
      const event = only(
        vevent(
          "DTSTART:20260824T070000Z",
          "SUMMARY:A title long enough that the exporter",
          "  had to fold it",
          "LOCATION:Somewhere spec",
          "\tific",
        ),
      );
      // Only the one space or tab that marks the continuation goes — the rest of the line is the
      // value, which is how a word folded down the middle survives the round trip.
      expect(event.title).toBe("A title long enough that the exporter had to fold it");
      expect(event.location).toBe("Somewhere specific");
    });

    it("reads a file written with bare CR line endings", () => {
      const event = only(vevent("SUMMARY:Old Mac", "DTSTART:20260824T070000Z").replace(/\r\n/g, "\r"));
      expect(event.title).toBe("Old Mac");
    });

    it("survives a continuation line with nothing to continue", () => {
      expect(parseIcs("  orphaned\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR")).toEqual([]);
    });

    it("ignores a line that isn't a property at all", () => {
      const event = only(vevent("this is not a property", "SUMMARY:Fine", "DTSTART:20260824T070000Z"));
      expect(event.title).toBe("Fine");
    });

    it("keeps the first of a repeated property", () => {
      const event = only(vevent("SUMMARY:Real", "SUMMARY:Later copy", "DTSTART:20260824T070000Z"));
      expect(event.title).toBe("Real");
    });

    it("unescapes the text values", () => {
      const event = only(
        vevent(
          "DTSTART:20260824T070000Z",
          "SUMMARY:Design\\, review",
          "DESCRIPTION:Line one\\nLine two\\NLine three\\;semicolon\\\\backslash",
        ),
      );
      expect(event.title).toBe("Design, review");
      expect(event.description).toBe("Line one\nLine two\nLine three;semicolon\\backslash");
    });

    it("reads an empty text value as nothing said", () => {
      const event = only(vevent("DTSTART:20260824T070000Z", "SUMMARY: ", "DESCRIPTION: ", "LOCATION:"));
      expect(event.title).toBe("");
      expect(event.description).toBeNull();
      expect(event.location).toBeNull();
      expect(event.uid).toBeNull();
    });

    it("reads an empty UID as none", () => {
      expect(only(vevent("UID: ", "DTSTART:20260824T070000Z")).uid).toBeNull();
    });

    it("doesn't split a property on a colon inside a quoted parameter", () => {
      const event = only(vevent('DTSTART;TZID="UTC":20260824T090000', "SUMMARY:Quoted"));
      expect(event.start).toEqual(new Date("2026-08-24T09:00:00Z"));
      expect(event.title).toBe("Quoted");
    });

    it("ignores a parameter written without a value", () => {
      const event = only(vevent("DTSTART;BROKEN:20260824T070000Z", "SUMMARY:Still here"));
      expect(event.start).toEqual(new Date("2026-08-24T07:00:00Z"));
    });
  });

  describe("what it refuses to import", () => {
    it("skips an event with no start", () => {
      expect(parseIcs(vevent("SUMMARY:Undated"))).toEqual([]);
    });

    it("skips an event whose start is unreadable", () => {
      expect(parseIcs(vevent("SUMMARY:Nonsense", "DTSTART:not-a-date"))).toEqual([]);
    });

    it("skips a cancellation, whatever case it is written in", () => {
      expect(parseIcs(vevent("SUMMARY:Called off", "DTSTART:20260824T070000Z", "STATUS:cancelled"))).toEqual([]);
    });

    it("keeps an event that is merely tentative", () => {
      expect(only(vevent("SUMMARY:Maybe", "DTSTART:20260824T070000Z", "STATUS:TENTATIVE")).title).toBe("Maybe");
    });

    it("reads none of an alarm's own fields as the event's", () => {
      const event = only(
        vevent(
          "SUMMARY:Reminded",
          "DTSTART:20260824T070000Z",
          "BEGIN:VALARM",
          "TRIGGER:-PT15M",
          "DURATION:PT5M",
          "SUMMARY:Alarm",
          "END:VALARM",
          "DURATION:PT2H",
        ),
      );
      expect(event.title).toBe("Reminded");
      expect(event.end).toEqual(new Date("2026-08-24T09:00:00Z"));
    });
  });

  describe("when it starts and ends", () => {
    it("reads a UTC stamp as the instant it is", () => {
      expect(only(vevent("DTSTART:20260824T070000Z")).start).toEqual(new Date("2026-08-24T07:00:00Z"));
    });

    it("reads a floating time as this device's own", () => {
      // The suite runs in Europe/Amsterdam, which is two hours ahead in August.
      expect(only(vevent("DTSTART:20260824T090000")).start).toEqual(new Date("2026-08-24T07:00:00Z"));
    });

    it("resolves a named zone's wall clock", () => {
      expect(only(vevent("DTSTART;TZID=America/New_York:20260824T090000")).start).toEqual(
        new Date("2026-08-24T13:00:00Z"),
      );
    });

    it("resolves a wall clock the spring-forward hour skipped over", () => {
      // 02:30 never happens in Amsterdam on 29 March 2026 — the clocks go 02:00 to 03:00. Reading
      // it with the offset either side of the change gives 03:30 CEST rather than an hour earlier.
      expect(only(vevent("DTSTART;TZID=Europe/Amsterdam:20260329T023000")).start).toEqual(
        new Date("2026-03-29T01:30:00Z"),
      );
    });

    it("falls back to this device's zone for one it has never heard of", () => {
      expect(only(vevent("DTSTART;TZID=Mars/Olympus:20260824T090000")).start).toEqual(new Date("2026-08-24T07:00:00Z"));
    });

    it("reads a bare date as an all-day event carried in UTC", () => {
      const event = only(vevent("DTSTART;VALUE=DATE:20260824", "DTEND;VALUE=DATE:20260826"));
      expect(event.allDay).toBe(true);
      expect(event.start).toEqual(new Date("2026-08-24T00:00:00Z"));
      expect(event.end).toEqual(new Date("2026-08-26T00:00:00Z"));
    });

    it("reads a date with no VALUE parameter as all-day anyway", () => {
      expect(only(vevent("DTSTART:20260824")).allDay).toBe(true);
    });

    it("reads a VALUE=DATE stamp as the day it names, whatever time is tacked on", () => {
      const event = only(vevent("DTSTART;VALUE=DATE:20260824T090000"));
      expect(event.allDay).toBe(true);
      expect(event.start).toEqual(new Date("2026-08-24T00:00:00Z"));
    });

    it("gives an all-day event with no end that one day", () => {
      expect(only(vevent("DTSTART;VALUE=DATE:20260824")).end).toEqual(new Date("2026-08-25T00:00:00Z"));
    });

    it("gives a timed event with no end an hour", () => {
      expect(only(vevent("DTSTART:20260824T070000Z")).end).toEqual(new Date("2026-08-24T08:00:00Z"));
    });

    it("takes the length from DURATION when there is no DTEND", () => {
      expect(only(vevent("DTSTART:20260824T070000Z", "DURATION:PT1H30M")).end).toEqual(
        new Date("2026-08-24T08:30:00Z"),
      );
      expect(only(vevent("DTSTART:20260824T070000Z", "DURATION:P1W2DT3H4M5S")).end).toEqual(
        new Date("2026-09-02T10:04:05Z"),
      );
    });

    it("prefers DTEND over DURATION, which is what the file means", () => {
      expect(only(vevent("DTSTART:20260824T070000Z", "DTEND:20260824T090000Z", "DURATION:PT8H")).end).toEqual(
        new Date("2026-08-24T09:00:00Z"),
      );
    });

    it("falls back when the end is unreadable, or before the start, or no length at all", () => {
      expect(only(vevent("DTSTART:20260824T070000Z", "DTEND:rubbish")).end).toEqual(new Date("2026-08-24T08:00:00Z"));
      expect(only(vevent("DTSTART:20260824T070000Z", "DTEND:20260824T060000Z")).end).toEqual(
        new Date("2026-08-24T08:00:00Z"),
      );
      expect(only(vevent("DTSTART:20260824T070000Z", "DTEND:20260824T070000Z")).end).toEqual(
        new Date("2026-08-24T08:00:00Z"),
      );
      expect(only(vevent("DTSTART:20260824T070000Z", "DURATION:rubbish")).end).toEqual(
        new Date("2026-08-24T08:00:00Z"),
      );
      expect(only(vevent("DTSTART:20260824T070000Z", "DURATION:PT0S")).end).toEqual(new Date("2026-08-24T08:00:00Z"));
      expect(only(vevent("DTSTART:20260824T070000Z", "DURATION:-PT30M")).end).toEqual(new Date("2026-08-24T08:00:00Z"));
    });
  });

  describe("recurrence", () => {
    it("says an event repeats without pretending to expand it", () => {
      const event = only(vevent("DTSTART:20260824T070000Z", "RRULE:FREQ=WEEKLY;BYDAY=MO"));
      expect(event.recurring).toBe(true);
      expect(event.start).toEqual(new Date("2026-08-24T07:00:00Z"));
    });

    it("counts extra dates as repetition too", () => {
      expect(only(vevent("DTSTART:20260824T070000Z", "RDATE:20260831T070000Z")).recurring).toBe(true);
    });
  });
});
