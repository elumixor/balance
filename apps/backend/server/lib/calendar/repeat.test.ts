import { describe, expect, test } from "bun:test";
import { ruleOf } from "./repeat";

const timed = { allDay: false, timeZone: "Europe/Kyiv" };

describe("ruleOf", () => {
  test("weekdays are written in calendar order, whatever order they came in", () => {
    expect(ruleOf({ days: ["FR", "MO", "WE"] }, timed)).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]);
  });

  test("no days means the start's own weekday", () => {
    expect(ruleOf({}, timed)).toEqual(["RRULE:FREQ=WEEKLY"]);
  });

  test("an empty list of days is a one-off", () => {
    expect(ruleOf({ days: [], count: 3 }, timed)).toEqual([]);
  });

  test("until on a timed event is the last second of that day where the person is, in UTC", () => {
    // Kyiv is UTC+2 in winter, so the day ends at 21:59:59Z.
    expect(ruleOf({ days: ["TU"], until: "2026-12-31" }, timed)).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T215959Z",
    ]);
  });

  test("until west of UTC rolls into the next UTC day rather than cutting the last one off", () => {
    expect(ruleOf({ until: "2026-12-31" }, { allDay: false, timeZone: "America/Los_Angeles" })).toEqual([
      "RRULE:FREQ=WEEKLY;UNTIL=20270101T075959Z",
    ]);
  });

  test("until on an all-day event is a date, matching its start", () => {
    expect(ruleOf({ days: ["SA"], until: "2027-01-09" }, { allDay: true, timeZone: "UTC" })).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20270109",
    ]);
  });

  test("count", () => {
    expect(ruleOf({ days: ["MO"], count: 10 }, timed)).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10"]);
  });

  test("until and count together are refused", () => {
    expect(() => ruleOf({ until: "2026-12-31", count: 2 }, timed)).toThrow("not both");
  });

  test("a malformed until or a zero count is refused", () => {
    expect(() => ruleOf({ until: "31.12.2026" }, timed)).toThrow("until");
    expect(() => ruleOf({ count: 0 }, timed)).toThrow("count");
  });
});
