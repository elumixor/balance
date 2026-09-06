import { describe, expect, it } from "bun:test";
import { type CopyInput, eligibleAngles, fallback, pickAngle } from "./copy-fallback";

const block = (id: string, title: string, hours: number, start = "2026-09-04T09:00:00.000Z") => ({
  id,
  title,
  start,
  end: start,
  categoryId: "c1",
  categoryName: "Work",
  color: "#000",
  icon: "briefcase",
  hours,
});

const base: CopyInput = {
  slot: "evening",
  timeZone: "Europe/Amsterdam",
  reviewed: "2026-09-04",
  hours: 6,
  categories: [],
  top: [block("a", "Portal connector", 2.8)],
  target: "2026-09-05",
  targetBlocks: [block("b", "Sadhana", 1, "2026-09-05T05:30:00.000Z")],
  targetPlanned: false,
  streak: 3,
  stars: 10,
  awardStars: 6,
};

describe("eligibleAngles", () => {
  it("offers every angle the numbers make true", () => {
    expect(eligibleAngles(base)).toEqual(["first", "biggest", "streak", "stars"]);
  });

  it("has only a bright line for a day with nothing on it", () => {
    expect(eligibleAngles({ ...base, hours: 0, top: [], targetBlocks: [], streak: 0, awardStars: 0 })).toEqual([
      "quiet",
    ]);
  });

  it("does not ask for a plan that already exists", () => {
    const angles = eligibleAngles({ ...base, targetPlanned: true });
    expect(angles).toContain("planned");
    expect(angles).not.toContain("first");
    expect(angles).not.toContain("stars");
  });

  it("puts the week first on Sunday", () => {
    expect(eligibleAngles({ ...base, slot: "weekly" })[0]).toBe("week");
  });
});

describe("pickAngle", () => {
  it("is stable for a day and moves across days", () => {
    expect(pickAngle(base)).toBe(pickAngle(base));
    const picks = new Set(
      Array.from({ length: 14 }, (_, i) => pickAngle({ ...base, reviewed: `2026-09-${`${i + 1}`.padStart(2, "0")}` })),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("never repeats yesterday's angle when it has a choice", () => {
    for (let i = 1; i <= 28; i++) {
      const reviewed = `2026-09-${`${i}`.padStart(2, "0")}`;
      const yesterday = pickAngle({ ...base, reviewed });
      expect(pickAngle({ ...base, reviewed, avoid: yesterday })).not.toBe(yesterday);
    }
  });

  it("falls back to the only angle even when told to avoid it", () => {
    expect(pickAngle({ ...base, hours: 0, top: [], targetBlocks: [], streak: 0, awardStars: 0, avoid: "quiet" })).toBe(
      "quiet",
    );
  });
});

describe("fallback", () => {
  it("fits a lock screen and names the angle it took", () => {
    const copy = fallback(base);
    expect(copy.title.length).toBeLessThanOrEqual(60);
    expect(copy.body.length).toBeLessThanOrEqual(160);
    expect(copy.generated).toBe(false);
    expect(eligibleAngles(base)).toContain(copy.angle);
  });

  it("says the first block's time in the person's own zone", () => {
    const copy = fallback({ ...base, top: [], streak: 0, awardStars: 0 });
    expect(copy.angle).toBe("first");
    expect(`${copy.title} ${copy.body}`).toContain("07:30");
  });

  it("recites no numbers for a day with nothing to count", () => {
    const copy = fallback({ ...base, hours: 0, top: [], targetBlocks: [], streak: 0, awardStars: 0 });
    expect(copy.angle).toBe("quiet");
    expect(copy.title).not.toMatch(/\d/);
    expect(copy.points[0].text).toContain("tomorrow");
  });

  it("speaks of today in the morning and of the week on Sunday", () => {
    const morning = fallback({ ...base, slot: "morning", targetPlanned: true, top: [], streak: 0 });
    expect(`${morning.title} ${morning.body}`).toContain("Today");
    const weekly = fallback({ ...base, slot: "weekly", top: [], streak: 0, awardStars: 0, targetBlocks: [] });
    expect(weekly.angle).toBe("week");
  });

  it("shortens a long event name so the title still fits", () => {
    const copy = fallback({
      ...base,
      top: [block("a", "A very long meeting name that goes on and on and on", 3)],
      streak: 0,
      awardStars: 0,
      targetBlocks: [],
    });
    expect(copy.title.length).toBeLessThanOrEqual(60);
  });
});
