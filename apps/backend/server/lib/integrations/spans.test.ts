import { describe, expect, test } from "bun:test";
import { planSpans } from "./spans";

/** Hours past midnight UTC; past 24 is the next morning. */
const at = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 8, 3, hours, minutes));
const span = (from: Date, to: Date) => ({ start: from, end: to });
const owned = (id: string, from: Date, to: Date) => ({ id, calendarId: "cal", start: from, end: to });

describe("planSpans", () => {
  test("nothing owned yet: every span is new", () => {
    const night = span(at(23), at(31));
    expect(planSpans([night], [])).toEqual({ create: [night], update: [], unchanged: [] });
  });

  test("a span the calendar already holds to the second is left alone", () => {
    const event = owned("a", at(23), at(31));
    const plan = planSpans([span(at(23), at(31))], [event]);
    expect(plan).toEqual({ create: [], update: [], unchanged: [event] });
  });

  test("sub-second drift from a provider's rounding is not a move", () => {
    const event = owned("a", at(23), at(31));
    const plan = planSpans([span(new Date(at(23).getTime() + 400), at(31))], [event]);
    expect(plan.update).toEqual([]);
    expect(plan.unchanged).toEqual([event]);
  });

  test("a night the watch finished syncing later moves the event's end", () => {
    const event = owned("a", at(23), at(29));
    const plan = planSpans([span(at(23), at(31))], [event]);
    expect(plan.update).toEqual([{ event, start: at(23), end: at(31) }]);
    expect(plan.create).toEqual([]);
  });

  test("an event the feed no longer mentions is neither deleted nor listed", () => {
    const event = owned("gone", at(1), at(2));
    const plan = planSpans([], [event]);
    expect(plan).toEqual({ create: [], update: [], unchanged: [] });
  });

  test("a span straddling two events claims the one it mostly is; the other stays", () => {
    const mostly = owned("mostly", at(0), at(6));
    const barely = owned("barely", at(6, 30), at(7));
    const plan = planSpans([span(at(0), at(6, 40))], [barely, mostly]);
    expect(plan.update).toEqual([{ event: mostly, start: at(0), end: at(6, 40) }]);
    expect(plan.create).toEqual([]);
  });

  test("two spans over one event: the better match takes it, the other is new", () => {
    const event = owned("a", at(0), at(6));
    const nap = span(at(5, 50), at(6, 30));
    const night = span(at(0), at(6));
    const plan = planSpans([nap, night], [event]);
    expect(plan.unchanged).toEqual([event]);
    expect(plan.create).toEqual([nap]);
  });

  test("touching without overlapping is not a match", () => {
    const event = owned("a", at(0), at(6));
    const next = span(at(6), at(7));
    expect(planSpans([next], [event]).create).toEqual([next]);
  });
});
