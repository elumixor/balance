import { describe, expect, it } from "vitest";
import { addDays, minutesIntoDay, startOfDay, startOfWeek, weekKey, weekRange, weekStartFromKey } from "./dates";

describe("startOfWeek", () => {
  it("is Monday, not Sunday", () => {
    // Sunday 2026-08-16 belongs to the week that started on the 10th, not the one starting today.
    expect(weekKey(new Date(2026, 7, 16))).toBe("2026-08-10");
    expect(weekKey(new Date(2026, 7, 10))).toBe("2026-08-10");
    expect(weekKey(new Date(2026, 7, 17))).toBe("2026-08-17");
  });

  it("doesn't mutate what it was given", () => {
    const date = new Date(2026, 7, 16, 13, 30);
    startOfWeek(date);
    startOfDay(date);
    addDays(date, 5);
    expect(date.getTime()).toBe(new Date(2026, 7, 16, 13, 30).getTime());
  });

  it("crosses a month and a year backwards", () => {
    expect(weekKey(new Date(2026, 0, 1))).toBe("2025-12-29");
  });
});

describe("addDays", () => {
  it("keeps the wall clock across a DST jump rather than adding 24 hours", () => {
    // Europe/Amsterdam springs forward on 2026-03-29. A day later is the same time next day,
    // which is 23 hours — the grid's columns are days, not fixed-length spans.
    const before = new Date(2026, 2, 28, 12, 0);
    const after = addDays(before, 1);
    expect(after.getHours()).toBe(12);
    expect(after.getDate()).toBe(29);
  });

  it("goes backwards and over month ends", () => {
    expect(addDays(new Date(2026, 2, 1), -1).getDate()).toBe(28);
    expect(addDays(new Date(2024, 2, 1), -1).getDate()).toBe(29);
  });
});

describe("weekStartFromKey", () => {
  it("round-trips every key weekKey can make", () => {
    for (let i = -400; i < 400; i += 7) {
      const key = weekKey(addDays(new Date(2026, 7, 10), i));
      expect(weekKey(weekStartFromKey(key))).toBe(key);
    }
  });

  it("reads the key as local midnight, not UTC", () => {
    const start = weekStartFromKey("2026-08-10");
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(10);
  });
});

describe("weekRange", () => {
  it("is a half-open week: the next Monday is the end, not part of it", () => {
    const { from, to } = weekRange("2026-08-10");
    expect(new Date(from).getTime()).toBe(new Date(2026, 7, 10).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 7, 17).getTime());
  });

  it("is 7 local days across a DST change, which is not 7 × 24 hours", () => {
    const { from, to } = weekRange(weekKey(new Date(2026, 2, 25)));
    const hours = (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
    // Either 168, or 167/169 in a zone that changes clocks that week. Never anything else.
    expect([167, 168, 169]).toContain(hours);
    expect(new Date(to).getHours()).toBe(0);
  });
});

describe("minutesIntoDay", () => {
  it("counts from local midnight", () => {
    expect(minutesIntoDay(new Date(2026, 7, 10, 0, 0))).toBe(0);
    expect(minutesIntoDay(new Date(2026, 7, 10, 23, 59))).toBe(1439);
  });
});
