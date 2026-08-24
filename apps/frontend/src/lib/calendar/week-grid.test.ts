import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "$lib/types";
import { NOT_A_MEETING } from "$lib/types";
import {
  allDaySpansForRange,
  daySpans,
  HOUR_PX,
  MIN_BLOCK_PX,
  placeDay,
  RESIZE_BAND_MAX_PX,
  RESIZE_BAND_SELECTED_PX,
  resizeBands,
  type Segment,
  segmentsForRange,
  snapMinutes,
} from "./week-grid";

/** The fields the grid reads, with the rest of an event filled in as the calendar would. */
function event(start: Date, end: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `${start.toISOString()}-${end.toISOString()}`,
    calendarId: "acc::cal",
    seriesId: null,
    title: "",
    description: null,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    declined: false,
    tentative: false,
    readOnly: false,
    countsTowardHours: true,
    url: null,
    mappingScope: null,
    activityId: null,
    activityName: null,
    weights: [],
    ...NOT_A_MEETING,
    ...extra,
  };
}

function segment(dayIndex: number, startMinutes: number, endMinutes: number): Segment {
  return {
    event: event(new Date(2026, 7, 10), new Date(2026, 7, 10)),
    dayIndex,
    startMinutes,
    endMinutes,
    continuesBefore: false,
    continuesAfter: false,
  };
}

const MONDAY = new Date(2026, 7, 10);

describe("segmentsForRange", () => {
  it("cuts an event at every midnight it crosses", () => {
    const parts = segmentsForRange([event(new Date(2026, 7, 10, 23, 0), new Date(2026, 7, 12, 1, 0))], MONDAY, 7);
    expect(parts.map((p) => [p.dayIndex, p.startMinutes, p.endMinutes])).toEqual([
      [0, 1380, 1440],
      [1, 0, 1440],
      [2, 0, 60],
    ]);
    expect(parts[0].continuesAfter).toBe(true);
    expect(parts[1].continuesBefore && parts[1].continuesAfter).toBe(true);
    expect(parts[2].continuesBefore).toBe(true);
  });

  it("ends a block at midnight rather than at minute zero of the same day", () => {
    const [only] = segmentsForRange([event(new Date(2026, 7, 10, 22, 0), new Date(2026, 7, 11, 0, 0))], MONDAY, 7);
    expect([only.dayIndex, only.startMinutes, only.endMinutes]).toEqual([0, 1320, 1440]);
    expect(only.continuesAfter).toBe(false);
  });

  it("clips an event that starts before the strip and one that ends after it", () => {
    const before = segmentsForRange([event(new Date(2026, 7, 8, 9, 0), new Date(2026, 7, 10, 10, 0))], MONDAY, 2);
    expect(before.map((p) => p.dayIndex)).toEqual([0]);
    expect(before[0].continuesBefore).toBe(true);
    expect(before[0].startMinutes).toBe(0);

    const after = segmentsForRange([event(new Date(2026, 7, 11, 9, 0), new Date(2026, 7, 14, 10, 0))], MONDAY, 2);
    expect(after.map((p) => p.dayIndex)).toEqual([1]);
    expect(after[0].continuesAfter).toBe(true);
    expect(after[0].endMinutes).toBe(1440);
  });

  it("drops events that only touch the strip's edges, and all-day ones", () => {
    const ends = event(new Date(2026, 7, 9, 9, 0), MONDAY);
    const starts = event(new Date(2026, 7, 17), new Date(2026, 7, 17, 9, 0));
    const allDay = event(new Date(2026, 7, 11), new Date(2026, 7, 12), { allDay: true });
    expect(segmentsForRange([ends, starts, allDay], MONDAY, 7)).toEqual([]);
  });

  it("puts a day after the clocks change in its own column", () => {
    // Europe/Amsterdam springs forward on 2026-03-29: midnight to midnight is 23 hours, and a
    // strip that divides by 24 puts Monday's blocks in Sunday's column for the rest of the week.
    const start = new Date(2026, 2, 29);
    const parts = segmentsForRange(
      [
        event(new Date(2026, 2, 29, 12, 0), new Date(2026, 2, 29, 13, 0)),
        event(new Date(2026, 2, 30, 12, 0), new Date(2026, 2, 30, 13, 0)),
        event(new Date(2026, 2, 31, 12, 0), new Date(2026, 2, 31, 13, 0)),
      ],
      start,
      7,
    );
    expect(parts.map((p) => p.dayIndex)).toEqual([0, 1, 2]);
    expect(parts.every((p) => p.startMinutes === 720)).toBe(true);
  });

  it("puts a day after the clocks go back in its own column too", () => {
    const start = new Date(2026, 9, 25);
    const parts = segmentsForRange(
      [
        event(new Date(2026, 9, 25, 12, 0), new Date(2026, 9, 25, 13, 0)),
        event(new Date(2026, 9, 26, 12, 0), new Date(2026, 9, 26, 13, 0)),
      ],
      start,
      7,
    );
    expect(parts.map((p) => p.dayIndex)).toEqual([0, 1]);
  });
});

describe("allDaySpansForRange", () => {
  it("treats Google's exclusive end date as the day before", () => {
    const [span] = allDaySpansForRange(
      [event(new Date(2026, 7, 11), new Date(2026, 7, 12), { allDay: true })],
      MONDAY,
      7,
    );
    expect([span.dayIndex, span.days, span.row]).toEqual([1, 1, 0]);
  });

  it("gives overlapping banners their own rows and reuses a row once it's free", () => {
    const spans = allDaySpansForRange(
      [
        event(new Date(2026, 7, 10), new Date(2026, 7, 13), { allDay: true }),
        event(new Date(2026, 7, 11), new Date(2026, 7, 14), { allDay: true }),
        event(new Date(2026, 7, 13), new Date(2026, 7, 14), { allDay: true }),
      ],
      MONDAY,
      7,
    );
    expect(spans.map((s) => [s.dayIndex, s.days, s.row])).toEqual([
      [0, 3, 0],
      [1, 3, 1],
      [3, 1, 0],
    ]);
  });

  it("puts the longer of two banners starting the same day on the top row", () => {
    const spans = allDaySpansForRange(
      [
        event(new Date(2026, 7, 11), new Date(2026, 7, 12), { allDay: true }),
        event(new Date(2026, 7, 11), new Date(2026, 7, 14), { allDay: true }),
      ],
      MONDAY,
      7,
    );
    expect(spans.map((s) => [s.days, s.row])).toEqual([
      [3, 0],
      [1, 1],
    ]);
  });

  it("clips a banner that runs past both ends of the strip", () => {
    const [span] = allDaySpansForRange(
      [event(new Date(2026, 7, 3), new Date(2026, 7, 20), { allDay: true })],
      MONDAY,
      7,
    );
    expect([span.dayIndex, span.days]).toEqual([0, 7]);
  });

  it("ignores timed events and banners outside the strip", () => {
    const timed = event(new Date(2026, 7, 10, 9, 0), new Date(2026, 7, 10, 10, 0));
    const past = event(new Date(2026, 7, 3), new Date(2026, 7, 10), { allDay: true });
    expect(allDaySpansForRange([timed, past], MONDAY, 7)).toEqual([]);
  });
});

describe("placeDay", () => {
  it("splits the width between events that collide and leaves the rest full width", () => {
    const placed = placeDay([segment(0, 540, 660), segment(0, 600, 720), segment(0, 900, 960)]);
    const [first, second, third] = placed.sort((a, b) => a.startMinutes - b.startMinutes);
    expect([first.widthPercent, second.widthPercent]).toEqual([50, 50]);
    expect([first.leftPercent, second.leftPercent]).toEqual([0, 50]);
    expect(third.widthPercent).toBe(100);
    expect(third.leftPercent).toBe(0);
  });

  it("keeps one busy hour from narrowing the rest of the day", () => {
    const placed = placeDay([segment(0, 0, 60), segment(0, 0, 60), segment(0, 120, 180)]);
    expect(placed.find((p) => p.startMinutes === 120)?.widthPercent).toBe(100);
  });

  it("reuses a column once its event has ended", () => {
    const placed = placeDay([segment(0, 0, 120), segment(0, 0, 60), segment(0, 60, 120)]);
    const stacked = placed.filter((p) => p.leftPercent > 0);
    expect(stacked).toHaveLength(2);
    expect(new Set(stacked.map((p) => p.leftPercent)).size).toBe(1);
  });

  it("never draws a block taller than the gap to the next one in its column", () => {
    const placed = placeDay([segment(0, 0, 240), segment(0, 0, 30), segment(0, 30, 240)]);
    const column = placed.filter((p) => p.leftPercent > 0).sort((a, b) => a.top - b.top);
    expect(column[0].height).toBe(column[1].top - column[0].top);
  });

  it("gives a quarter-hour block a floor and a zero-length one a visible line", () => {
    const [quarter] = placeDay([segment(0, 0, 15)]);
    expect(quarter.height).toBe(MIN_BLOCK_PX);
    const [empty] = placeDay([segment(0, 600, 600)]);
    expect(empty.height).toBe(MIN_BLOCK_PX);
    expect(empty.top).toBe((600 / 60) * HOUR_PX);
  });

  it("leaves a line rather than nothing when the next block is a minute away", () => {
    const placed = placeDay([segment(0, 0, 240), segment(0, 0, 0), segment(0, 1, 60)]);
    const squeezed = placed.find((p) => p.startMinutes === 0 && p.endMinutes === 0);
    expect(squeezed?.height).toBe(1);
  });

  it("draws the day at the pinched scale, floor and all", () => {
    const zoomed = 4 * HOUR_PX;
    const [block] = placeDay([segment(0, 60, 120)], zoomed);
    expect(block.top).toBe(zoomed);
    expect(block.height).toBe(zoomed);
    // The quarter-hour floor is a quarter of an hour, not a fixed number of pixels: pinched right
    // down it must not become the tallest thing on the grid.
    const [squeezed] = placeDay([segment(0, 0, 5)], HOUR_PX / 2);
    expect(squeezed.height).toBe(((15 / 60) * HOUR_PX) / 2);
  });

  it("has nothing to place for an empty day", () => {
    expect(placeDay([])).toEqual([]);
  });
});

describe("resizeBands", () => {
  it("caps each band at a third, so the middle of a block always answers a tap", () => {
    expect(resizeBands(24, false)).toEqual({ band: 8, overhang: 0 });
    expect(resizeBands(120, false).band).toBe(RESIZE_BAND_MAX_PX);
  });

  it("gives a block too short to carry handles none at all until it's selected", () => {
    expect(resizeBands(12, false)).toEqual({ band: 0, overhang: 0 });
    const selected = resizeBands(12, true);
    expect(selected.band).toBe(RESIZE_BAND_SELECTED_PX);
    expect(selected.overhang).toBe(RESIZE_BAND_SELECTED_PX - 4);
  });

  it("hangs a selected sliver's handles outside it rather than shrinking them away", () => {
    const { band, overhang } = resizeBands(0, true);
    expect(band).toBe(RESIZE_BAND_SELECTED_PX);
    expect(overhang).toBe(RESIZE_BAND_SELECTED_PX);
  });
});

describe("daySpans", () => {
  it("cuts a drag at midnight", () => {
    expect(daySpans(1320, 1800)).toEqual([
      { dayOffset: 0, startMinutes: 1320, endMinutes: 1440 },
      { dayOffset: 1, startMinutes: 0, endMinutes: 360 },
    ]);
  });

  it("handles a start dragged back past midnight into negative minutes", () => {
    expect(daySpans(-60, 60)).toEqual([
      { dayOffset: -1, startMinutes: 1380, endMinutes: 1440 },
      { dayOffset: 0, startMinutes: 0, endMinutes: 60 },
    ]);
  });

  it("draws nothing for a range that ends where it starts, or before it", () => {
    expect(daySpans(600, 600)).toEqual([]);
    expect(daySpans(600, 540)).toEqual([]);
  });

  it("spans three days without losing a minute", () => {
    const spans = daySpans(600, 600 + 3 * 1440);
    expect(spans).toHaveLength(4);
    expect(spans.reduce((total, s) => total + (s.endMinutes - s.startMinutes), 0)).toBe(3 * 1440);
  });
});

describe("snapMinutes", () => {
  it("rounds to the nearest quarter, halves upward, and keeps its sign", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(7.5)).toBe(15);
    expect(snapMinutes(22.5)).toBe(30);
    expect(snapMinutes(-7.5)).toBe(-0);
    expect(snapMinutes(-8)).toBe(-15);
  });
});
