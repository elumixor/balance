import { describe, expect, it } from "bun:test";
import { gateProgress } from "./gates";

const base = { threshold: 3, windowDays: 14, decideOn: "2026-09-30", today: "2026-09-25" };

describe("gateProgress", () => {
  it("counts distinct days, not blocks", () => {
    const observations = [{ day: "2026-09-20" }, { day: "2026-09-20" }, { day: "2026-09-21" }];
    expect(gateProgress({ ...base, metric: "days", observations }).count).toBe(2);
  });

  it("counts distinct people by their key", () => {
    const observations = [
      { day: "2026-09-20", key: "dima" },
      { day: "2026-09-21", key: "dima" },
      { day: "2026-09-21", key: "tim" },
    ];
    const progress = gateProgress({ ...base, metric: "people", observations });
    expect(progress.count).toBe(2);
    expect(progress.passed).toBe(false);
  });

  it("sums hours and throughput, rounding to a readable number", () => {
    const observations = [
      { day: "2026-09-20", quantity: 1.25 },
      { day: "2026-09-21", quantity: 2.083333 },
    ];
    expect(gateProgress({ ...base, metric: "hours", observations }).count).toBe(3.33);
    expect(gateProgress({ ...base, metric: "throughput", observations: [{ day: "2026-09-20" }] }).count).toBe(1);
  });

  it("treats a named event as done or not, whatever threshold was typed", () => {
    const passed = gateProgress({ ...base, metric: "event", threshold: 5, observations: [{ day: "2026-09-20" }] });
    expect(passed).toMatchObject({ count: 1, threshold: 1, passed: true });
    expect(gateProgress({ ...base, metric: "event", observations: [] }).passed).toBe(false);
  });

  it("only counts inside the window that ends on the decision day", () => {
    const observations = [{ day: "2026-09-15" }, { day: "2026-09-16" }, { day: "2026-09-30" }, { day: "2026-10-01" }];
    const progress = gateProgress({ ...base, metric: "days", observations });
    expect(progress.windowStart).toBe("2026-09-16");
    expect(progress.count).toBe(2);
  });

  it("is not measurable before the window opens, and never reads as failing then", () => {
    const progress = gateProgress({ ...base, metric: "days", today: "2026-09-10", observations: [] });
    expect(progress.measurable).toBe(false);
    expect(progress.passed).toBe(false);
    expect(progress.count).toBe(0);
  });

  it("passes on the threshold exactly", () => {
    const observations = [{ day: "2026-09-20" }, { day: "2026-09-21" }, { day: "2026-09-22" }];
    expect(gateProgress({ ...base, metric: "days", observations }).passed).toBe(true);
  });
});
