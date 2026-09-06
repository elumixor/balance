import { describe, expect, it } from "vitest";
import { addDays, MINUTES_PER_DAY } from "./dates";
import {
  edgeAt,
  insideStrip,
  instantAt,
  pointerToEdge,
  pointerToPoint,
  pointerToRaw,
  pointerToSlot,
  STRIP_DAYS,
} from "./geometry";

/** A strip 100px per day and 1px per minute, so the numbers can be read straight off. */
const DAY_PX = 100;
const box = { left: 10, top: 20, width: STRIP_DAYS * DAY_PX, height: MINUTES_PER_DAY };
const at = (dayIndex: number, minutes: number) => ({
  clientX: box.left + dayIndex * DAY_PX,
  clientY: box.top + minutes,
});
const stripStart = new Date(2026, 8, 7);

describe("pointerToRaw and pointerToPoint", () => {
  it("reads the pointer in days and minutes from the strip's corner", () => {
    expect(pointerToRaw(box, at(2.5, 90))).toEqual({ dayIndex: 2.5, minutes: 90 });
  });

  it("holds the day inside the strip but lets the minutes run past either end", () => {
    expect(pointerToRaw(box, at(-1, -30))).toEqual({ dayIndex: 0, minutes: -30 });
    expect(pointerToRaw(box, at(STRIP_DAYS + 1, MINUTES_PER_DAY + 30))).toEqual({
      dayIndex: STRIP_DAYS,
      minutes: MINUTES_PER_DAY + 30,
    });
  });

  it("a point is held inside the day too, since a rectangle can't be drawn past it", () => {
    expect(pointerToPoint(box, at(1, -30))).toEqual({ dayIndex: 1, minutes: 0 });
    expect(pointerToPoint(box, at(1, MINUTES_PER_DAY + 30))).toEqual({ dayIndex: 1, minutes: MINUTES_PER_DAY });
    expect(pointerToPoint(box, at(1, 45))).toEqual({ dayIndex: 1, minutes: 45 });
  });
});

describe("pointerToSlot", () => {
  const noGrab = { days: 0, minutes: 0 };

  it("snaps to the nearest column and quarter hour, keeping the unsnapped reading beside it", () => {
    const slot = pointerToSlot(box, at(2.6, 100), stripStart, noGrab);
    expect(slot.index).toBe(3);
    expect(slot.rawIndex).toBeCloseTo(2.6);
    expect(slot.day).toEqual(addDays(stripStart, 3));
    expect(slot.minutes).toBe(105);
    expect(slot.rawMinutes).toBe(100);
  });

  it("keeps the block where it was grabbed rather than under the pointer", () => {
    // Grabbed 30 minutes below its top and half a day to the right of its column.
    const slot = pointerToSlot(box, at(2, 100), stripStart, { days: -0.5, minutes: -30 });
    expect(slot.rawIndex).toBe(1.5);
    expect(slot.index).toBe(2);
    expect(slot.rawMinutes).toBe(70);
    expect(slot.minutes).toBe(75);
  });

  it("lets minutes run into the days either side but never a column past the strip", () => {
    const past = pointerToSlot(box, at(STRIP_DAYS, MINUTES_PER_DAY + 30), stripStart, noGrab);
    expect(past.index).toBe(STRIP_DAYS - 1);
    expect(past.rawMinutes).toBe(MINUTES_PER_DAY + 30);
    const before = pointerToSlot(box, at(0, -30), stripStart, { days: -2, minutes: 0 });
    expect(before.index).toBe(0);
    expect(before.rawMinutes).toBe(-30);
  });
});

describe("pointerToEdge and edgeAt", () => {
  const day = addDays(stripStart, 2);

  it("counts the edge from the block's own day, whichever column the pointer is in", () => {
    expect(pointerToEdge(box, at(2.4, 100), stripStart, day, 0)).toEqual({ minutes: 105, rawMinutes: 100 });
    // A column later: the same minute reads a day further on. Floored, not rounded.
    expect(pointerToEdge(box, at(3.9, 100), stripStart, day, 0).rawMinutes).toBe(MINUTES_PER_DAY + 100);
    expect(pointerToEdge(box, at(1.2, 100), stripStart, day, 0).rawMinutes).toBe(100 - MINUTES_PER_DAY);
  });

  it("moves the edge by what the pointer travelled, not to where it sits", () => {
    expect(pointerToEdge(box, at(2, 100), stripStart, day, 20)).toEqual({ minutes: 120, rawMinutes: 120 });
  });

  it("stops at the strip's own ends", () => {
    expect(pointerToEdge(box, at(STRIP_DAYS, MINUTES_PER_DAY + 500), stripStart, day, 0).rawMinutes).toBe(
      (STRIP_DAYS - 2) * MINUTES_PER_DAY,
    );
    expect(pointerToEdge(box, at(0, -500), stripStart, day, 0).rawMinutes).toBe(-2 * MINUTES_PER_DAY);
  });

  it("edgeAt is the unsnapped edge before any grab offset", () => {
    expect(edgeAt(box, at(2, 100), stripStart, day)).toBe(100);
    expect(edgeAt(box, at(2, 103), stripStart, day)).toBe(103);
  });
});

describe("insideStrip", () => {
  it("re-counts a column's minutes from the anchor day", () => {
    expect(insideStrip(3, 60, 1)).toBe(2 * MINUTES_PER_DAY + 60);
    expect(insideStrip(0, 60, 1)).toBe(60 - MINUTES_PER_DAY);
  });

  it("keeps a block of a given length wholly on the strip", () => {
    const length = 120;
    expect(insideStrip(STRIP_DAYS - 1, MINUTES_PER_DAY, 0, length)).toBe(STRIP_DAYS * MINUTES_PER_DAY - length);
    expect(insideStrip(0, -10, 0, length)).toBe(0);
  });
});

describe("instantAt", () => {
  it("is minutes after midnight, running into the neighbouring days either way", () => {
    const day = new Date(2026, 8, 7);
    expect(instantAt(day, 90)).toEqual(new Date(2026, 8, 7, 1, 30));
    expect(instantAt(day, MINUTES_PER_DAY + 30)).toEqual(new Date(2026, 8, 8, 0, 30));
    expect(instantAt(day, -30)).toEqual(new Date(2026, 8, 6, 23, 30));
  });
});
