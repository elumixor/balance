import { describe, expect, it } from "vitest";
import { barOf, parentOptions, readLink, weekTotals } from "./sphere-tree";
import type { SphereProgress } from "./types";

const sphere = (id: string, parentId: string | null = null, isBuffer = false) => ({ id, parentId, isBuffer });

function row(
  id: string,
  parentId: string | null,
  targetHours: number,
  tracked: number,
  scheduled: number,
): SphereProgress {
  return {
    id,
    name: id,
    parentId,
    urn: null,
    targetHours,
    trackedHours: tracked,
    scheduledHours: scheduled,
    remainingHours: Math.max(0, targetHours - tracked - scheduled),
    warning: null,
  };
}

describe("parentOptions", () => {
  const spheres = [sphere("work"), sphere("health"), sphere("balance", "work"), sphere("buffer", null, true)];

  it("offers every other top-level sphere, never the Buffer, itself or a part", () => {
    expect(parentOptions("health", spheres).map((s) => s.id)).toEqual(["work"]);
    expect(parentOptions("balance", spheres).map((s) => s.id)).toEqual(["work", "health"]);
  });

  it("offers nothing to a sphere that holds parts, which would land two levels down", () => {
    expect(parentOptions("work", spheres)).toEqual([]);
  });

  it("offers the list to a sphere not saved yet", () => {
    expect(parentOptions("new", spheres).map((s) => s.id)).toEqual(["work", "health"]);
  });
});

describe("barOf", () => {
  it("splits a week under its target into spent and ahead", () => {
    expect(barOf(row("a", null, 20, 5, 7))).toEqual({ tracked: 0.25, scheduled: 0.35, overHours: 0, plannedHours: 12 });
  });

  it("fills the bar past the target and keeps the proportion of its parts", () => {
    const bar = barOf(row("a", null, 10, 9, 6));
    expect(bar.tracked + bar.scheduled).toBeCloseTo(1);
    expect(bar.tracked).toBeCloseTo(0.6);
    expect(bar.overHours).toBe(5);
  });

  it("does not report -0 or float dust as being over", () => {
    expect(barOf(row("a", null, 0.3, 0.1, 0.2)).overHours).toBe(0);
  });

  it("draws an empty bar for a sphere with no target and nothing planned", () => {
    expect(barOf(row("a", null, 0, 0, 0))).toEqual({ tracked: 0, scheduled: 0, overHours: 0, plannedHours: 0 });
  });

  it("calls every hour over when there is no target at all", () => {
    expect(barOf(row("a", null, 0, 2, 0))).toEqual({ tracked: 1, scheduled: 0, overHours: 2, plannedHours: 2 });
  });
});

describe("weekTotals", () => {
  it("sums only top-level spheres — a part's hours are already its parent's", () => {
    const totals = weekTotals([
      row("work", null, 30, 10, 12),
      row("balance", "work", 20, 8, 10),
      row("health", null, 7.1, 2.2, 1.1),
    ]);
    expect(totals).toEqual({ trackedHours: 12.2, scheduledHours: 13.1, targetHours: 37.1 });
  });

  it("is all zeros for an empty week", () => {
    expect(weekTotals([])).toEqual({ trackedHours: 0, scheduledHours: 0, targetHours: 0 });
  });
});

describe("readLink", () => {
  it("takes a Keep page link, a legacy keep URN or any https link", () => {
    expect(readLink(" https://keep.desk.atmagaming.com/p/abc ")).toEqual({
      urn: "https://keep.desk.atmagaming.com/p/abc",
    });
    expect(readLink("keep:page/abc")).toEqual({ urn: "keep:page/abc" });
  });

  it("clears the link when the field is emptied", () => {
    expect(readLink("   ")).toEqual({ urn: null });
  });

  it("refuses what isn't a link the server would take or the card could open", () => {
    expect(readLink("http://example.com")).toBeNull();
    expect(readLink("my project")).toBeNull();
    expect(readLink("https://a b")).toBeNull();
  });
});
