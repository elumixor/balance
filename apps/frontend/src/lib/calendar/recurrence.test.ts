import { describe, expect, it } from "vitest";
import { fromRecurrence, NEVER, ordinal, presets, type Rule, describe as say, toRRule } from "./recurrence";

const tuesday = new Date(2026, 2, 10, 9);

describe("presets", () => {
  it("names the day and the date the event falls on", () => {
    const labels = presets(tuesday).map((p) => p.label);
    expect(labels).toEqual(["Daily", "Every weekday", "Weekly on Tuesday", "Monthly on the 10th", "Yearly"]);
  });

  it("round-trips every preset through RRULE", () => {
    for (const { rule } of presets(tuesday)) expect(fromRecurrence([toRRule(rule)])).toEqual(rule);
  });
});

describe("toRRule", () => {
  it("writes the simplest rule with only a frequency", () => {
    expect(toRRule({ frequency: "daily", interval: 1, weekdays: [], end: NEVER })).toBe("RRULE:FREQ=DAILY");
  });

  it("writes interval, sorted weekdays, and each kind of end", () => {
    const base: Rule = { frequency: "weekly", interval: 2, weekdays: [3, 1], end: NEVER };
    expect(toRRule(base)).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(toRRule({ ...base, end: { kind: "until", day: "2026-12-31" } })).toBe(
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z",
    );
    expect(toRRule({ ...base, end: { kind: "count", count: 5 } })).toBe(
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5",
    );
  });

  it("drops weekdays from anything but a weekly rule", () => {
    expect(toRRule({ frequency: "monthly", interval: 1, weekdays: [1], end: NEVER })).toBe("RRULE:FREQ=MONTHLY");
  });
});

describe("fromRecurrence", () => {
  it("is null with no lines, no RRULE, or an unknown frequency", () => {
    expect(fromRecurrence(null)).toBeNull();
    expect(fromRecurrence(undefined)).toBeNull();
    expect(fromRecurrence(["EXDATE:20260101"])).toBeNull();
    expect(fromRecurrence(["RRULE:FREQ=HOURLY"])).toBeNull();
  });

  it("reads Google's own spelling, WKST and all", () => {
    expect(fromRecurrence(["RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20260430T215959Z;BYDAY=TU,TH"])).toEqual({
      frequency: "weekly",
      interval: 1,
      weekdays: [2, 4],
      end: { kind: "until", day: "2026-04-30" },
    });
    expect(fromRecurrence(["RRULE:FREQ=MONTHLY;COUNT=3"])).toEqual({
      frequency: "monthly",
      interval: 1,
      weekdays: [],
      end: { kind: "count", count: 3 },
    });
  });

  it("leaves alone what it can't draw rather than misreading it", () => {
    expect(fromRecurrence(["RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15"])).toBeNull();
    expect(fromRecurrence(["RRULE:FREQ=MONTHLY;BYDAY=2MO"])).toBeNull();
    expect(fromRecurrence(["RRULE:FREQ=MONTHLY;BYDAY=MO"])).toBeNull();
  });
});

describe("describe", () => {
  const rule = (patch: Partial<Rule>): Rule => ({
    frequency: "daily",
    interval: 1,
    weekdays: [],
    end: NEVER,
    ...patch,
  });

  it("says the plain cases in one word", () => {
    expect(say(rule({}))).toBe("Daily");
    expect(say(rule({ frequency: "yearly" }))).toBe("Yearly");
    expect(say(rule({ frequency: "monthly" }))).toBe("Monthly");
    expect(say(rule({ frequency: "monthly" }), tuesday)).toBe("Monthly on the 10th");
    expect(say(rule({ frequency: "monthly", interval: 2 }), tuesday)).toBe("Every 2 months");
  });

  it("names weekdays, and recognises the working week", () => {
    expect(say(rule({ frequency: "weekly", weekdays: [1, 2, 3, 4, 5] }))).toBe("Every weekday");
    expect(say(rule({ frequency: "weekly", interval: 2, weekdays: [5, 1] }))).toBe("Every 2 weeks on Mon, Fri");
    expect(say(rule({ frequency: "weekly", interval: 2, weekdays: [1, 2, 3, 4, 5] }))).toBe(
      "Every 2 weeks on Mon, Tue, Wed, Thu, Fri",
    );
    expect(say(rule({ frequency: "weekly" }))).toBe("Weekly");
  });

  it("adds how it ends", () => {
    expect(say(rule({ end: { kind: "count", count: 10 } }))).toBe("Daily, 10 times");
    expect(say(rule({ end: { kind: "until", day: "2026-12-31" } }))).toMatch(/^Daily until Dec 31, 2026$/);
  });
});

describe("ordinal", () => {
  it("handles the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "111th",
    ]);
  });
});
