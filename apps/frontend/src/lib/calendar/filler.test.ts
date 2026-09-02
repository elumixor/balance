import { describe, expect, it } from "vitest";
import { DEFAULT_FILL, fillWeek, freeSlots } from "./filler";

const weekStart = new Date(2026, 8, 7); // Mon 7 Sep 2026
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, 7 + day, hour, minute);
const clock = (d: Date) => `${d.getDate()} ${d.getHours()}:${`${d.getMinutes()}`.padStart(2, "0")}`;

describe("freeSlots", () => {
  it("cuts busy time out of working hours, skips weekends, and never offers the past", () => {
    const slots = freeSlots({
      ...DEFAULT_FILL,
      weekStart,
      from: at(0, 11),
      busy: [
        { start: at(0, 8), end: at(0, 12) },
        { start: at(0, 14), end: at(0, 15) },
        { start: at(1, 17), end: at(1, 20) },
      ],
      workdays: [1, 2],
    });
    expect(slots.map((s) => [clock(s.start), clock(s.end)])).toEqual([
      ["7 12:00", "7 14:00"],
      ["7 15:00", "7 18:00"],
      ["8 9:00", "8 17:00"],
    ]);
  });

  it("returns nothing for a day already over", () => {
    expect(freeSlots({ ...DEFAULT_FILL, weekStart, from: at(0, 19), busy: [], workdays: [1] })).toEqual([]);
  });
});

describe("fillWeek", () => {
  it("takes turns in rank order, in blocks no longer than the cap, until each claim is met", () => {
    const blocks = fillWeek({
      ...DEFAULT_FILL,
      weekStart,
      from: at(0, 9),
      busy: [],
      wants: [
        { id: "a", hours: 3 },
        { id: "b", hours: 1 },
      ],
      workdays: [1],
    });
    expect(blocks.map((b) => [b.id, clock(b.start), clock(b.end)])).toEqual([
      ["a", "7 9:00", "7 11:00"],
      ["b", "7 11:00", "7 12:00"],
      ["a", "7 12:00", "7 13:00"],
    ]);
  });

  it("shortens the tail when the week runs out, and rounds to the slot", () => {
    const blocks = fillWeek({
      ...DEFAULT_FILL,
      weekStart,
      from: at(0, 16),
      busy: [],
      wants: [
        { id: "a", hours: 1.4 },
        { id: "b", hours: 4 },
      ],
      workdays: [1],
    });
    expect(blocks.map((b) => [b.id, clock(b.start), clock(b.end)])).toEqual([
      ["a", "7 16:00", "7 17:00"],
      ["b", "7 17:00", "7 18:00"],
    ]);
  });

  it("drops a want that is already met and a sliver too short for a slot", () => {
    const blocks = fillWeek({
      ...DEFAULT_FILL,
      weekStart,
      from: at(0, 17, 45),
      busy: [],
      wants: [
        { id: "done", hours: 0 },
        { id: "a", hours: 2 },
      ],
      workdays: [1],
    });
    expect(blocks).toEqual([]);
  });

  it("stops once everything is placed rather than walking every slot", () => {
    const blocks = fillWeek({
      ...DEFAULT_FILL,
      weekStart,
      from: at(0, 9),
      busy: [{ start: at(0, 10), end: at(0, 11) }],
      wants: [{ id: "a", hours: 1.5 }],
    });
    expect(blocks.map((b) => [clock(b.start), clock(b.end)])).toEqual([
      ["7 9:00", "7 10:00"],
      ["7 11:00", "7 11:30"],
    ]);
  });
});
