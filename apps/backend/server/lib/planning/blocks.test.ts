import { describe, expect, test } from "bun:test";
import type { ResolvedEvent } from "~/lib/calendar/events-service";
import { blocksOf, categoryHours, claimedHours, toBlock, toPlannedBlock } from "./blocks";
import type { PlanCategory, SessionBlock } from "./types";

const category = (id: string, targetHoursPerWeek: number, isBuffer = false): PlanCategory => ({
  id,
  name: id.toUpperCase(),
  color: `#${id}`,
  icon: "circle",
  targetHoursPerWeek,
  isBuffer,
});

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 6, hour, minute));

const event = (
  id: string,
  start: Date,
  end: Date,
  weights: { categoryId: string; weightPercent: number }[],
  countsTowardHours = true,
): ResolvedEvent => ({ id, title: id, start, end, weights, countsTowardHours }) as unknown as ResolvedEvent;

const day = { start: at(0), end: new Date(Date.UTC(2026, 8, 7)) };

describe("claimedHours", () => {
  test("sums every target but the buffer's", () => {
    expect(claimedHours([category("a", 10), category("b", 5.5), category("buf", 150, true)])).toBe(15.5);
  });

  test("an empty ring claims nothing", () => {
    expect(claimedHours([])).toBe(0);
  });
});

describe("categoryHours", () => {
  const plan = [category("work", 40), category("rest", 20), category("buf", 100, true)];

  test("splits an event's span by its weights and clips it to the range", () => {
    const events = [
      event("split", at(9), at(11), [
        { categoryId: "work", weightPercent: 75 },
        { categoryId: "rest", weightPercent: 25 },
      ]),
      event("overnight", at(23), new Date(Date.UTC(2026, 8, 7, 2)), [{ categoryId: "rest", weightPercent: 100 }]),
    ];
    const hours = categoryHours(events, plan, day);
    expect(hours.map((c) => [c.categoryId, c.hours])).toEqual([
      ["work", 1.5],
      ["rest", 1.5],
    ]);
    expect(hours[0]).toMatchObject({ name: "WORK", color: "#work", icon: "circle", targetHours: 40 });
  });

  test("ignores what doesn't count, what lies outside the range, and the buffer", () => {
    const events = [
      event("declined", at(9), at(10), [{ categoryId: "work", weightPercent: 100 }], false),
      event("yesterday", new Date(Date.UTC(2026, 8, 5, 9)), new Date(Date.UTC(2026, 8, 5, 10)), [
        { categoryId: "work", weightPercent: 100 },
      ]),
      event("free", at(12), at(13), [{ categoryId: "buf", weightPercent: 100 }]),
    ];
    const hours = categoryHours(events, plan, day);
    expect(hours.every((c) => c.hours === 0)).toBe(true);
    expect(hours.some((c) => c.categoryId === "buf")).toBe(false);
  });

  test("biggest first", () => {
    const events = [
      event("a", at(9), at(10), [{ categoryId: "rest", weightPercent: 100 }]),
      event("b", at(10), at(13), [{ categoryId: "work", weightPercent: 100 }]),
    ];
    expect(categoryHours(events, [category("rest", 1), category("work", 1)], day).map((c) => c.categoryId)).toEqual([
      "work",
      "rest",
    ]);
  });
});

describe("blocksOf", () => {
  const plan = [category("work", 40), category("rest", 20)];

  test("clips to the range, names the dominant category, and sorts by start", () => {
    const events = [
      event("late", at(22), new Date(Date.UTC(2026, 8, 7, 1)), [{ categoryId: "rest", weightPercent: 100 }]),
      event("early", at(9), at(10, 30), [
        { categoryId: "rest", weightPercent: 40 },
        { categoryId: "work", weightPercent: 60 },
      ]),
    ];
    const blocks = blocksOf(events, day, plan);
    expect(blocks.map((b) => b.id)).toEqual(["early", "late"]);
    expect(blocks[0]).toMatchObject({ categoryId: "work", categoryName: "WORK", color: "#work", hours: 1.5 });
    expect(blocks[1]).toMatchObject({ end: day.end.toISOString(), hours: 2 });
  });

  test("an unmapped event is a block that counts as nothing; an unknown category has no name", () => {
    const events = [
      event("blank", at(9), at(10), []),
      event("orphan", at(11), at(12), [{ categoryId: "gone", weightPercent: 100 }]),
    ];
    const [blank, orphan] = blocksOf(events, day);
    expect(blank).toMatchObject({ categoryId: null, categoryName: null, color: null, icon: null });
    expect(orphan).toMatchObject({ categoryId: "gone", categoryName: null });
  });

  test("leaves out what doesn't count and what doesn't touch the range", () => {
    const events = [
      event("declined", at(9), at(10), [], false),
      event("edge", at(0), at(0), []),
      event("before", new Date(Date.UTC(2026, 8, 5, 23)), at(0), []),
    ];
    expect(blocksOf(events, day)).toEqual([]);
  });
});

describe("block conversions", () => {
  const block: SessionBlock = {
    id: "x",
    title: "X",
    start: at(9).toISOString(),
    end: at(10).toISOString(),
    categoryId: "work",
    categoryName: "WORK",
    color: "#work",
    icon: "circle",
    hours: 1,
  };

  test("toBlock keeps only what coverage reads, as instants", () => {
    expect(toBlock(block)).toEqual({ start: at(9).getTime(), end: at(10).getTime(), categoryId: "work" });
  });

  test("toPlannedBlock keeps the id as well, for the snapshot", () => {
    expect(toPlannedBlock(block)).toEqual({
      id: "x",
      start: at(9).getTime(),
      end: at(10).getTime(),
      categoryId: "work",
    });
  });
});
