import { describe, expect, it } from "vitest";
import {
  addDays,
  dayAt,
  daysBetween,
  dragged,
  offsetOf,
  periodsOf,
  placeOf,
  SCALES,
  type Span,
  scaleOf,
  spanOf,
  ticksOf,
  unionOf,
  widthOf,
  windowOf,
} from "./gantt";

const task = (id: string, startsOn: string | null, endsOn: string | null, parentId: string | null = null) => ({
  id,
  parentId,
  startsOn,
  endsOn,
});

const week = scaleOf("week");
const month = scaleOf("month");
const quarter = scaleOf("quarter");
const year = scaleOf("year");

describe("day arithmetic", () => {
  it("counts days across a month and across DST", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-03-30", -1)).toBe("2026-03-29");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-03-30", "2026-03-30")).toBe(0);
  });
});

describe("scaleOf", () => {
  it("answers every scale the control offers, and the middle one to anything else", () => {
    for (const scale of SCALES) expect(scaleOf(scale.key)).toBe(scale);
    expect(scaleOf("nonsense" as never)).toBe(month);
  });
});

describe("unionOf", () => {
  it("covers every span it is given", () => {
    expect(
      unionOf([{ start: "2026-02-01", end: "2026-02-03" }, null, { start: "2026-01-20", end: "2026-01-25" }]),
    ).toEqual({ start: "2026-01-20", end: "2026-02-03" });
  });

  it("has nothing to say about nothing", () => {
    expect(unionOf([null])).toBeNull();
  });
});

describe("spanOf", () => {
  const rows = [
    task("parent", null, null),
    task("a", "2026-02-02", "2026-02-04", "parent"),
    task("b", "2026-02-06", null, "parent"),
    task("dated", "2026-03-01", "2026-02-01"),
    task("lonely", null, null),
  ];

  it("uses a row's own days when it has them", () => {
    expect(spanOf("a", rows)).toEqual({ start: "2026-02-02", end: "2026-02-04" });
  });

  it("ends a one-day task the day it starts, even when the end is nonsense", () => {
    expect(spanOf("b", rows)).toEqual({ start: "2026-02-06", end: "2026-02-06" });
    expect(spanOf("dated", rows)).toEqual({ start: "2026-03-01", end: "2026-03-01" });
  });

  it("spans its children when it has no days of its own", () => {
    expect(spanOf("parent", rows)).toEqual({ start: "2026-02-02", end: "2026-02-06" });
  });

  it("has no span with neither dates nor children", () => {
    expect(spanOf("lonely", rows)).toBeNull();
    expect(spanOf("nobody", rows)).toBeNull();
  });

  it("stops at a row that is its own child", () => {
    expect(spanOf("self", [task("self", null, null, "self")])).toBeNull();
  });
});

describe("windowOf", () => {
  it("opens on whole months around the work and today", () => {
    expect(windowOf([{ start: "2026-02-10", end: "2026-11-20" }], "2026-03-01", week)).toEqual({
      start: "2026-02-01",
      end: "2026-11-30",
    });
  });

  it("always covers today, even when nothing is dated near it", () => {
    const bounds = windowOf([{ start: "2026-02-10", end: "2026-02-20" }], "2026-06-15", quarter);
    expect(bounds.start).toBe("2026-02-01");
    expect(bounds.end >= "2026-06-15").toBe(true);
  });

  it("widens a short plan until there is a screenful to scroll", () => {
    const narrow = windowOf([], "2026-03-01", week);
    expect(narrow.start).toBe("2026-03-01");
    // A week's columns are 52px, so 31 days is well under the screenful the grid insists on.
    expect(daysBetween(narrow.start, narrow.end) + 1).toBeGreaterThanOrEqual(Math.ceil(1600 / week.dayWidth));
    expect(narrow.end.slice(-2)).toBe("31");
  });

  it("leaves a plan that is already wide enough alone", () => {
    expect(windowOf([{ start: "2020-01-05", end: "2026-05-05" }], "2026-03-01", year)).toEqual({
      start: "2020-01-01",
      end: "2026-05-31",
    });
  });

  it("measures a February that has a twenty-ninth", () => {
    expect(windowOf([{ start: "2024-02-05", end: "2024-02-06" }], "2024-02-05", year).start).toBe("2024-02-01");
  });
});

describe("placing days", () => {
  const bounds: Span = { start: "2026-03-01", end: "2026-03-31" };

  it("measures the window in pixels", () => {
    expect(widthOf(bounds, month)).toBe(31 * month.dayWidth);
  });

  it("puts a day where its column starts, and reads a pointer back to it", () => {
    expect(offsetOf("2026-03-11", bounds, month)).toBe(10 * month.dayWidth);
    expect(dayAt(10 * month.dayWidth + 3, bounds, month)).toBe("2026-03-11");
  });

  it("never reads a pointer past either end of the window", () => {
    expect(dayAt(-500, bounds, month)).toBe("2026-03-01");
    expect(dayAt(99_999, bounds, month)).toBe("2026-03-31");
  });

  it("places a bar and says nothing was clipped", () => {
    expect(placeOf({ start: "2026-03-03", end: "2026-03-04" }, bounds, month)).toEqual({
      left: 2 * month.dayWidth,
      width: 2 * month.dayWidth,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("clips a bar that runs past either end, and says which", () => {
    const place = placeOf({ start: "2026-01-01", end: "2026-12-31" }, bounds, month);
    expect(place).toMatchObject({ left: 0, width: 31 * month.dayWidth, clippedStart: true, clippedEnd: true });
  });

  it("draws a one-day bar wide enough to hit, however far out the scale is", () => {
    expect(placeOf({ start: "2026-03-03", end: "2026-03-03" }, bounds, year).width).toBe(6);
  });
});

describe("dragged", () => {
  const span: Span = { start: "2026-03-10", end: "2026-03-14" };

  it("carries the whole of a bar", () => {
    expect(dragged(span, "move", 3)).toEqual({ start: "2026-03-13", end: "2026-03-17" });
  });

  it("pulls either edge", () => {
    expect(dragged(span, "start", -2)).toEqual({ start: "2026-03-08", end: "2026-03-14" });
    expect(dragged(span, "end", 2)).toEqual({ start: "2026-03-10", end: "2026-03-16" });
  });

  it("never lets an edge cross the other one", () => {
    expect(dragged(span, "start", 20)).toEqual({ start: "2026-03-14", end: "2026-03-14" });
    expect(dragged(span, "end", -20)).toEqual({ start: "2026-03-10", end: "2026-03-10" });
  });
});

describe("ticksOf", () => {
  it("draws a column a day, weekends marked and today named", () => {
    const ticks = ticksOf({ start: "2026-03-01", end: "2026-03-09" }, month, "2026-03-03");
    expect(ticks).toHaveLength(9);
    expect(ticks[0]).toMatchObject({ key: "2026-03-01", label: "1", weekend: true, today: false });
    expect(ticks[2]).toMatchObject({ label: "3", today: true });
    expect(ticks[2]?.left).toBe(2 * month.dayWidth);
  });

  it("says which weekday it is when a column has the room", () => {
    expect(ticksOf({ start: "2026-03-02", end: "2026-03-03" }, week, "2026-03-02")[0]?.label).toBe("Mon 2");
  });

  it("cuts weeks at Mondays, so the first column is the stub of one", () => {
    const ticks = ticksOf({ start: "2026-03-01", end: "2026-03-19" }, quarter, "2026-03-03");
    expect(ticks.map((tick) => tick.key)).toEqual(["2026-03-01", "2026-03-02", "2026-03-09", "2026-03-16"]);
    expect(ticks[0]?.width).toBe(quarter.dayWidth);
    expect(ticks[1]?.width).toBe(7 * quarter.dayWidth);
    // The last column is what is left of the window, not a whole week running past its end.
    expect(ticks[3]?.width).toBe(4 * quarter.dayWidth);
    expect(ticks[0]?.weekend).toBe(false);
    expect(ticks[0]?.today).toBe(false);
  });

  it("cuts months at a year's scale, naming each one", () => {
    const ticks = ticksOf({ start: "2026-01-01", end: "2026-03-31" }, year, "2026-01-01");
    expect(ticks.map((tick) => tick.label)).toEqual(["Jan", "Feb", "Mar"]);
    expect(ticks[1]?.left).toBe(31 * year.dayWidth);
  });
});

describe("periodsOf", () => {
  it("names the month over each stretch of columns, clipped to the window", () => {
    const periods = periodsOf({ start: "2026-02-10", end: "2026-04-05" }, month);
    expect(periods.map((period) => period.label)).toEqual(["Feb 2026", "Mar 2026", "Apr 2026"]);
    expect(periods[0]?.width).toBe(19 * month.dayWidth);
    expect(periods[2]?.width).toBe(5 * month.dayWidth);
  });

  it("names years instead once the columns are months", () => {
    const periods = periodsOf({ start: "2025-11-01", end: "2026-02-28" }, year);
    expect(periods.map((period) => period.label)).toEqual(["2025", "2026"]);
    expect(periods[0]?.width).toBe(61 * year.dayWidth);
  });
});
