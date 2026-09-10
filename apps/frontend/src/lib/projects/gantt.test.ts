import { describe, expect, it } from "vitest";
import { addDays, barOf, boundsOf, columnsOf, daysBetween, spanOf, unionOf } from "./gantt";

const task = (id: string, startsOn: string | null, endsOn: string | null, parentId: string | null = null) => ({
  id,
  parentId,
  startsOn,
  endsOn,
});

describe("day arithmetic", () => {
  it("counts days across a month and across DST", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-03-30", -1)).toBe("2026-03-29");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-03-30", "2026-03-30")).toBe(0);
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

describe("boundsOf", () => {
  it("covers the work, today, and three days either side", () => {
    expect(boundsOf([{ start: "2026-02-01", end: "2026-04-01" }], "2026-03-01")).toEqual({
      start: "2026-01-29",
      end: "2026-04-04",
    });
  });

  it("gives an empty plan three weeks around today", () => {
    expect(boundsOf([], "2026-03-01")).toEqual({ start: "2026-02-26", end: "2026-03-18" });
  });

  it("stretches a short plan to the same three weeks", () => {
    expect(boundsOf([{ start: "2026-03-02", end: "2026-03-03" }], "2026-03-01")).toEqual({
      start: "2026-02-26",
      end: "2026-03-18",
    });
  });
});

describe("barOf", () => {
  const bounds = { start: "2026-03-01", end: "2026-03-10" };

  it("places a bar as a share of the window", () => {
    expect(barOf({ start: "2026-03-01", end: "2026-03-05" }, bounds)).toEqual({ leftPercent: 0, widthPercent: 50 });
  });

  it("clips a bar that runs past either end and never draws it away", () => {
    expect(barOf({ start: "2026-02-01", end: "2026-04-01" }, bounds)).toEqual({ leftPercent: 0, widthPercent: 100 });
    expect(barOf({ start: "2026-03-20", end: "2026-03-21" }, bounds).widthPercent).toBe(10);
  });
});

describe("columnsOf", () => {
  it("cuts the window into weeks, the last one as wide as what is left", () => {
    const columns = columnsOf({ start: "2026-03-01", end: "2026-03-19" });
    expect(columns.map((column) => column.key)).toEqual(["2026-03-01", "2026-03-08", "2026-03-15"]);
    expect(columns[2]?.widthPercent).toBeCloseTo((5 / 19) * 100);
    expect(columns[0]?.leftPercent).toBe(0);
  });

  it("names the first column and every column that opens a month", () => {
    const columns = columnsOf({ start: "2026-02-22", end: "2026-03-15" });
    expect(columns.map((column) => column.label)).toEqual(["Feb 22", "Mar 1", "8", "15"]);
  });
});
