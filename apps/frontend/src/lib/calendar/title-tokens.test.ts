import { describe, expect, it } from "vitest";
import { formatDayDate } from "$lib/format";
import {
  compose,
  dayLabel,
  durationLabel,
  isoDay,
  parseSegments,
  parseWhen,
  resolve,
  spanMinutes,
  type TitleFields,
  tokenOf,
  whenLabel,
  whenToken,
} from "./title-tokens";

const now = new Date(2026, 8, 4, 10, 0);

const fields: TitleFields = {
  title: "Deep work",
  date: "2026-09-04",
  from: "13:30",
  to: "14:30",
  projectId: "p1",
  practiceId: null,
};

describe("parseWhen", () => {
  it("reads a day, a time, a span, and any of them together", () => {
    expect(parseWhen("2026-10-14")).toEqual({ kind: "when", date: "2026-10-14", start: null, end: null });
    expect(parseWhen("13:30")).toEqual({ kind: "when", date: null, start: "13:30", end: null });
    expect(parseWhen("13:30-14:30")).toEqual({ kind: "when", date: null, start: "13:30", end: "14:30" });
    expect(parseWhen("2026-10-14T13:30")).toEqual({ kind: "when", date: "2026-10-14", start: "13:30", end: null });
    expect(parseWhen("2026-10-14T13:30-14:30")).toEqual({
      kind: "when",
      date: "2026-10-14",
      start: "13:30",
      end: "14:30",
    });
  });

  it("refuses anything else", () => {
    expect(parseWhen("tomorrow")).toBeNull();
    expect(parseWhen("2026-10-14T")).toBeNull();
    expect(parseWhen("-14:30")).toBeNull();
  });

  it("round-trips through the token", () => {
    for (const spec of ["2026-10-14", "13:30", "13:30-14:30", "2026-10-14T13:30", "2026-10-14T13:30-14:30"]) {
      const when = parseWhen(spec);
      expect(when && whenToken(when)).toBe(`@when:${spec}`);
    }
  });
});

describe("parseSegments", () => {
  it("keeps the words and turns every token into its segment", () => {
    expect(parseSegments("Deep work @when:2026-09-04 @when:13:30-14:30 @project:p1")).toEqual([
      { kind: "text", value: "Deep work " },
      { kind: "when", date: "2026-09-04", start: null, end: null },
      { kind: "text", value: " " },
      { kind: "when", date: null, start: "13:30", end: "14:30" },
      { kind: "text", value: " " },
      { kind: "project", id: "p1" },
    ]);
    expect(parseSegments("@practice:x @dur:90 after")).toEqual([
      { kind: "practice", id: "x" },
      { kind: "text", value: " " },
      { kind: "dur", minutes: 90 },
      { kind: "text", value: " after" },
    ]);
  });

  it("leaves a token it can't read as the text it was", () => {
    expect(parseSegments("@when:soon @dur:long")).toEqual([
      { kind: "text", value: "@when:soon" },
      { kind: "text", value: " " },
      { kind: "text", value: "@dur:long" },
    ]);
  });

  it("writes every segment back as the token it came from", () => {
    const text = "@project:p1 @practice:x @when:2026-09-04T09:00-10:00 @dur:45";
    const tokens = parseSegments(text).flatMap((s) => (s.kind === "text" ? [] : [tokenOf(s)]));
    expect(tokens.join(" ")).toBe(text);
  });
});

describe("labels", () => {
  it("names the days around today and dates the rest", () => {
    expect(dayLabel("2026-09-04", now)).toBe("Today");
    expect(dayLabel("2026-09-05", now)).toBe("Tomorrow");
    expect(dayLabel("2026-09-03", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-14", now)).toBe(formatDayDate(new Date(2026, 9, 14)));
  });

  it("puts the clock after the day when both are there", () => {
    expect(whenLabel({ date: "2026-09-05", start: "13:30", end: "14:30" }, now)).toBe("Tomorrow, 13:30 – 14:30");
    expect(whenLabel({ date: "2026-09-05", start: null, end: null }, now)).toBe("Tomorrow");
    expect(whenLabel({ date: null, start: "13:30", end: null }, now)).toBe("13:30");
  });

  it("says a length in hours and minutes", () => {
    expect(durationLabel(45)).toBe("45m");
    expect(durationLabel(60)).toBe("1h");
    expect(durationLabel(90)).toBe("1h 30m");
  });

  it("writes a day the way the tokens read it", () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("compose", () => {
  it("puts the day, the span and the purpose after the name", () => {
    expect(compose(fields)).toBe("Deep work @when:2026-09-04 @when:13:30-14:30 @project:p1");
    expect(compose({ ...fields, projectId: null, practiceId: "x" })).toBe(
      "Deep work @when:2026-09-04 @when:13:30-14:30 @practice:x",
    );
  });

  it("leaves out a missing name and a missing purpose", () => {
    expect(compose({ ...fields, title: "", projectId: null })).toBe("@when:2026-09-04 @when:13:30-14:30");
  });
});

describe("spanMinutes", () => {
  it("counts a span that ends before it starts as running past midnight", () => {
    expect(spanMinutes("13:30", "14:30")).toBe(60);
    expect(spanMinutes("23:00", "01:00")).toBe(120);
    expect(spanMinutes("09:00", "09:00")).toBe(24 * 60);
  });
});

describe("resolve", () => {
  it("gives the same fields back for the line it composed", () => {
    expect(resolve(compose(fields), fields)).toEqual(fields);
  });

  it("takes the name from the words, tidied", () => {
    expect(resolve("  Deep   @when:2026-09-04  work  ", fields).title).toBe("Deep work");
  });

  it("keeps the day and the span when their pills are gone", () => {
    expect(resolve("Deep work @project:p1", fields)).toEqual(fields);
  });

  it("moves the day alone, the start alone, or both", () => {
    expect(resolve("x @when:2026-10-14", fields)).toMatchObject({ date: "2026-10-14", from: "13:30", to: "14:30" });
    expect(resolve("x @when:09:00", fields)).toMatchObject({ date: "2026-09-04", from: "09:00", to: "10:00" });
    expect(resolve("x @when:2026-10-14T09:00-11:00", fields)).toMatchObject({
      date: "2026-10-14",
      from: "09:00",
      to: "11:00",
    });
  });

  it("makes a length into an end, and lets whichever comes last win", () => {
    expect(resolve("x @dur:90", fields)).toMatchObject({ from: "13:30", to: "15:00" });
    expect(resolve("x @when:13:30-14:30 @dur:90", fields)).toMatchObject({ to: "15:00" });
    expect(resolve("x @dur:90 @when:13:30-14:00", fields)).toMatchObject({ to: "14:00" });
    expect(resolve("x @when:23:30 @dur:60", fields)).toMatchObject({ from: "23:30", to: "00:30" });
  });

  it("reads the purpose from its pill, and none as detached", () => {
    expect(resolve("x @practice:pr", fields)).toMatchObject({ projectId: null, practiceId: "pr" });
    expect(resolve("x @practice:pr @project:p2", fields)).toMatchObject({ projectId: "p2", practiceId: null });
    expect(resolve("x", fields)).toMatchObject({ projectId: null, practiceId: null });
  });
});
