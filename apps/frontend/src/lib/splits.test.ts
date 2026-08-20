import { describe, expect, it } from "vitest";
import { restColor } from "./colors";
import { activitySplits } from "./splits";
import type { Activity, Category } from "./types";

function category(id: string, extra: Partial<Category> = {}): Category {
  return { id, name: id, color: "#C4553B", icon: "book", targetHoursPerWeek: 10, isBuffer: false, ...extra };
}

function activity(weights: { categoryId: string; weightPercent: number }[]): Activity {
  return { id: "a", name: "Reading", weights };
}

const categories = new Map([
  ["deep", category("deep")],
  ["rest", category("rest", { color: "#3B8E9E", isBuffer: true })],
]);

describe("activitySplits", () => {
  it("shows what an activity doesn't assign as free time", () => {
    expect(activitySplits(activity([{ categoryId: "deep", weightPercent: 60 }]), categories)).toEqual([
      { id: "deep", color: "#C4553B", value: 60 },
      { id: "__free__", color: restColor, value: 40 },
    ]);
  });

  it("is all free time when nothing is assigned", () => {
    expect(activitySplits(activity([]), categories)).toEqual([{ id: "__free__", color: restColor, value: 100 }]);
  });

  it("adds no free slice when the mix is full", () => {
    const splits = activitySplits(activity([{ categoryId: "deep", weightPercent: 100 }]), categories);
    expect(splits.map((s) => s.id)).toEqual(["deep"]);
  });

  it("never draws a negative slice when the weights add up to more than a whole", () => {
    const splits = activitySplits(
      activity([
        { categoryId: "deep", weightPercent: 80 },
        { categoryId: "rest", weightPercent: 80 },
      ]),
      categories,
    );
    expect(splits.map((s) => s.id)).toEqual(["deep", "rest"]);
    expect(splits.every((s) => s.value > 0)).toBe(true);
  });

  it("skips weights pointing at categories that are gone, and empty ones", () => {
    const splits = activitySplits(
      activity([
        { categoryId: "deleted", weightPercent: 50 },
        { categoryId: "deep", weightPercent: 0 },
        { categoryId: "deep", weightPercent: -10 },
      ]),
      categories,
    );
    expect(splits).toEqual([{ id: "__free__", color: restColor, value: 100 }]);
  });

  it("draws a buffer category in the neutral, whatever colour it was given", () => {
    const [slice] = activitySplits(activity([{ categoryId: "rest", weightPercent: 30 }]), categories);
    expect(slice.color).toBe(restColor);
  });
});
