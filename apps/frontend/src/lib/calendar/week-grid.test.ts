import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./types";
import { NOT_A_MEETING } from "./types";
import {
  allDayRowCount,
  allDaySpansForRange,
  BLOCK_GUTTER_PX,
  blocksFor,
  CROWDED_HOUR_PX,
  DRAW_MARGIN_DAYS,
  daySpans,
  drawnBounds,
  gridLines,
  gutterTicks,
  HALF_HOUR_LINE_PX,
  HOUR_PX,
  inWindow,
  MAX_HOUR_PX,
  MIN_BLOCK_PX,
  marqueeBox,
  NEST_HEAD_PX,
  NEST_INSET_PX,
  type PlacedSegment,
  placeDay,
  placeStrip,
  QUARTER_HOUR_LINE_PX,
  RESIZE_BAND_MAX_PX,
  RESIZE_BAND_SELECTED_PX,
  resizeBands,
  type Segment,
  STAGGER_FRACTION,
  type StripWindow,
  segmentsForRange,
  snapMinutes,
  spanInWindow,
  travelBandBox,
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
    movable: true,
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
    const allDay = event(new Date(2026, 7, 11), new Date(2026, 7, 12), {
      allDay: true,
    });
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
    const past = event(new Date(2026, 7, 3), new Date(2026, 7, 10), {
      allDay: true,
    });
    expect(allDaySpansForRange([timed, past], MONDAY, 7)).toEqual([]);
  });
});

describe("placeDay", () => {
  const COLUMN = 200;
  const FULL = COLUMN - BLOCK_GUTTER_PX;
  const byStart = (placed: PlacedSegment[]) => [...placed].sort((a, b) => a.startMinutes - b.startMinutes);

  it("draws a block that collides with nothing at full width", () => {
    const [block] = placeDay([segment(0, 540, 600)], HOUR_PX, COLUMN);
    expect(block).toMatchObject({ left: 0, width: FULL, depth: 0 });
  });

  it("staggers a later block over the one it runs into and lets the rest of the day be", () => {
    const placed = byStart(
      placeDay([segment(0, 540, 660), segment(0, 600, 720), segment(0, 900, 960)], HOUR_PX, COLUMN),
    );
    const [first, second, third] = placed;
    expect(first).toMatchObject({ left: 0, width: FULL, depth: 0 });
    expect(second).toMatchObject({
      left: FULL * STAGGER_FRACTION,
      width: FULL * (1 - STAGGER_FRACTION),
      depth: 1,
    });
    expect(third).toMatchObject({ left: 0, width: FULL, depth: 0 });
  });

  it("nests a block that sits inside another below its title row", () => {
    const placed = byStart(placeDay([segment(0, 1080, 1255), segment(0, 1140, 1185)], HOUR_PX, COLUMN));
    const [bus, sadhana] = placed;
    expect(bus).toMatchObject({ left: 0, width: FULL, depth: 0 });
    expect(sadhana).toMatchObject({
      left: NEST_INSET_PX,
      width: FULL - NEST_INSET_PX,
      depth: 1,
    });
  });

  it("staggers instead of nesting when the inner block would cover the outer one's name", () => {
    // Same start: nothing of the parent's title row would be left showing.
    const [, sameStart] = byStart(placeDay([segment(0, 600, 720), segment(0, 600, 615)], HOUR_PX, COLUMN));
    expect(sameStart.left).toBe(FULL * STAGGER_FRACTION);
    // A start just under the threshold, at the rest scale.
    const close = (NEST_HEAD_PX / HOUR_PX) * 60 - 1;
    const [, tooClose] = byStart(placeDay([segment(0, 600, 720), segment(0, 600 + close, 700)], HOUR_PX, COLUMN));
    expect(tooClose.left).toBe(FULL * STAGGER_FRACTION);
    // Overhanging the parent's end is not inside it either.
    const [, overhang] = byStart(placeDay([segment(0, 600, 720), segment(0, 660, 780)], HOUR_PX, COLUMN));
    expect(overhang.left).toBe(FULL * STAGGER_FRACTION);
  });

  it("measures the nesting gap at the pinched scale", () => {
    const zoomed = 4 * HOUR_PX;
    // Fifteen minutes is 48px when pinched right in — enough for a title row.
    const [, child] = byStart(placeDay([segment(0, 600, 720), segment(0, 615, 660)], zoomed, COLUMN));
    expect(child.left).toBe(NEST_INSET_PX);
  });

  it("cascades a third block off the one on top, not the one underneath", () => {
    const placed = byStart(
      placeDay([segment(0, 540, 780), segment(0, 600, 660), segment(0, 630, 700)], HOUR_PX, COLUMN),
    );
    const [, nested, third] = placed;
    expect(third.depth).toBe(2);
    expect(third.left).toBe(nested.left + nested.width * STAGGER_FRACTION);
    expect(third.left + third.width).toBe(nested.left + nested.width);
  });

  it("goes back to the block underneath once the one on top has ended", () => {
    const placed = byStart(
      placeDay([segment(0, 540, 780), segment(0, 600, 660), segment(0, 660, 700)], HOUR_PX, COLUMN),
    );
    const [, first, second] = placed;
    expect(second).toMatchObject({
      left: first.left,
      width: first.width,
      depth: 1,
    });
  });

  it("stacks a block that starts inside another's quarter-hour floor rather than drawing through it", () => {
    const placed = byStart(placeDay([segment(0, 0, 0), segment(0, 1, 60)], HOUR_PX, COLUMN));
    const [empty, next] = placed;
    expect(empty.height).toBe(MIN_BLOCK_PX);
    expect(next.depth).toBe(1);
  });

  it("gives a quarter-hour block a floor and a zero-length one a visible line", () => {
    const [quarter] = placeDay([segment(0, 0, 15)]);
    expect(quarter.height).toBe(MIN_BLOCK_PX);
    const [empty] = placeDay([segment(0, 600, 600)]);
    expect(empty.height).toBe(MIN_BLOCK_PX);
    expect(empty.top).toBe((600 / 60) * HOUR_PX);
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

  it("never lets a cascade collapse a block below a pixel wide", () => {
    const events = Array.from({ length: 12 }, () => segment(0, 600, 660));
    for (const block of placeDay(events, HOUR_PX, 40)) expect(block.width).toBeGreaterThanOrEqual(1);
  });

  it("never reads a block ending where the next starts as a collision, at any pinch", () => {
    for (let k = 1; k < 300; k++) {
      const hourPx = HOUR_PX * (1 + k / 100);
      const placed = placeDay([segment(0, 540, 600), segment(0, 600, 720), segment(0, 720, 735)], hourPx, COLUMN);
      for (const block of placed) expect(block.depth).toBe(0);
    }
  });

  it("has nothing to place for an empty day", () => {
    expect(placeDay([])).toEqual([]);
  });
});

describe("gridLines", () => {
  it("draws only the hours until one is tall enough to divide", () => {
    expect(gridLines(HOUR_PX)).toEqual([{ minutes: 60, mix: 100 }]);
    expect(gridLines(HALF_HOUR_LINE_PX - 1)).toEqual([{ minutes: 60, mix: 100 }]);
  });

  it("adds the half hour, then the quarter, each fainter than the last", () => {
    const half = gridLines(HALF_HOUR_LINE_PX);
    expect(half.map((line) => line.minutes)).toEqual([60, 30]);
    const quarter = gridLines(QUARTER_HOUR_LINE_PX);
    expect(quarter.map((line) => line.minutes)).toEqual([60, 30, 15]);
    // Coarsest first — the order they're painted in — and never brighter than the hour above it.
    expect(quarter.map((line) => line.mix)).toEqual([...quarter.map((line) => line.mix)].sort((a, b) => b - a));
  });
});

describe("gutterTicks", () => {
  const at = (hourPx: number, minutes: number) => gutterTicks(hourPx).find((tick) => tick.minutes === minutes);

  it("names every hour but midnight, which the top edge would cut in half", () => {
    const ticks = gutterTicks(HOUR_PX);
    expect(ticks[0]).toEqual({ minutes: 60, label: "01:00", major: true });
    expect(ticks.at(-1)).toEqual({
      minutes: 23 * 60,
      label: "23:00",
      major: true,
    });
    expect(ticks.some((tick) => tick.minutes === 0)).toBe(false);
  });

  it("reads the same ticks on another zone's clock, wrapping past midnight", () => {
    const shifted = gutterTicks(HOUR_PX, 7 * 60);
    expect(shifted[0]).toEqual({ minutes: 60, label: "08:00", major: true });
    expect(shifted.at(-1)).toEqual({
      minutes: 23 * 60,
      label: "06:00",
      major: true,
    });
    expect(gutterTicks(HOUR_PX, -90)[0]).toEqual({
      minutes: 60,
      label: "23:30",
      major: true,
    });
  });

  it("thins out to every second hour when they're closer together than a label", () => {
    expect(gutterTicks(CROWDED_HOUR_PX - 1).map((tick) => tick.label)).toEqual([
      "02:00",
      "04:00",
      "06:00",
      "08:00",
      "10:00",
      "12:00",
      "14:00",
      "16:00",
      "18:00",
      "20:00",
      "22:00",
    ]);
  });

  it("names the divisions the grid draws, by the whole clock time", () => {
    expect(at(HALF_HOUR_LINE_PX, 30)).toEqual({
      minutes: 30,
      label: "00:30",
      major: false,
    });
    expect(at(HALF_HOUR_LINE_PX, 15)).toBeUndefined();
    expect(at(QUARTER_HOUR_LINE_PX, 14 * 60 + 45)).toEqual({
      minutes: 885,
      label: "14:45",
      major: false,
    });
    expect(at(QUARTER_HOUR_LINE_PX, 14 * 60 + 15)).toEqual({
      minutes: 855,
      label: "14:15",
      major: false,
    });
  });

  it("says as much as the grid draws, never more", () => {
    for (const hourPx of [HOUR_PX / 2, HOUR_PX, HALF_HOUR_LINE_PX, QUARTER_HOUR_LINE_PX, MAX_HOUR_PX]) {
      const finestLine = Math.min(...gridLines(hourPx).map((line) => line.minutes));
      const finestTick = Math.min(...gutterTicks(hourPx).map((tick) => tick.minutes));
      expect(finestTick).toBeGreaterThanOrEqual(finestLine);
    }
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

describe("placeStrip", () => {
  it("buckets every segment into its own column, laid out at the given scale", () => {
    const events = [
      event(new Date(2026, 7, 10, 9), new Date(2026, 7, 10, 10)),
      event(new Date(2026, 7, 10, 9, 30), new Date(2026, 7, 10, 11)),
      event(new Date(2026, 7, 12, 22), new Date(2026, 7, 13, 2)),
    ];
    const strip = placeStrip(events, MONDAY, 7, HOUR_PX, 100);
    expect(strip).toHaveLength(7);
    expect(strip[0]).toHaveLength(2);
    expect(strip[0][1].depth).toBe(1);
    expect(strip[0][0].width).toBe(100 - BLOCK_GUTTER_PX);
    expect(strip[2]).toHaveLength(1);
    expect(strip[3]).toHaveLength(1);
    expect(strip[3][0].continuesBefore).toBe(true);
    expect(strip[1]).toEqual([]);
  });

  it("is a strip of empty columns without events", () => {
    expect(placeStrip([], MONDAY, 3, HOUR_PX, 100)).toEqual([[], [], []]);
  });
});

describe("drawnBounds", () => {
  const window: StripWindow = { offset: 7, visibleDays: 7, stripDays: 21 };

  it("draws the window plus a runway either side", () => {
    expect(drawnBounds(window)).toEqual({ first: 7 - DRAW_MARGIN_DAYS, last: 13 + DRAW_MARGIN_DAYS });
  });

  it("never runs off either end of the strip", () => {
    expect(drawnBounds({ ...window, offset: 0 })).toEqual({ first: 0, last: 6 + DRAW_MARGIN_DAYS });
    expect(drawnBounds({ ...window, offset: 14 })).toEqual({ first: 14 - DRAW_MARGIN_DAYS, last: 20 });
  });
});

describe("inWindow", () => {
  const window: StripWindow = { offset: 7, visibleDays: 3, stripDays: 21 };

  it("is the columns the window is over, ends included and excluded the way a range is", () => {
    expect(inWindow(6, window)).toBe(false);
    expect(inWindow(7, window)).toBe(true);
    expect(inWindow(9, window)).toBe(true);
    expect(inWindow(10, window)).toBe(false);
  });
});

describe("blocksFor", () => {
  const window: StripWindow = { offset: 7, visibleDays: 3, stripDays: 21 };
  // Two different events: the helper's ids are made of their dates.
  const placed = placeDay([
    segment(8, 540, 600),
    { ...segment(8, 660, 720), event: event(new Date(2026, 7, 11), new Date(2026, 7, 12)) },
  ]);
  const [first, second] = placed;

  it("is empty off the runway, whatever has been seen", () => {
    expect(blocksFor(placed, 0, window, new Set([first.event.id]))).toEqual([]);
    expect(blocksFor(placed, 20, window, new Set())).toEqual([]);
  });

  it("is every block on a column in the window", () => {
    expect(blocksFor(placed, 8, window, new Set())).toBe(placed);
  });

  it("is only the blocks already seen on the runway", () => {
    const seen = new Set([second.event.id]);
    expect(blocksFor(placed, 11, window, seen)).toEqual([second]);
    expect(blocksFor(placed, 4, window, new Set())).toEqual([]);
  });
});

describe("spanInWindow", () => {
  const window: StripWindow = { offset: 7, visibleDays: 3, stripDays: 21 };

  it("counts a banner that touches any day on screen", () => {
    expect(spanInWindow(5, 3, window)).toBe(true);
    expect(spanInWindow(9, 4, window)).toBe(true);
    expect(spanInWindow(4, 3, window)).toBe(false);
    expect(spanInWindow(10, 1, window)).toBe(false);
  });
});

describe("allDayRowCount", () => {
  const window: StripWindow = { offset: 7, visibleDays: 3, stripDays: 21 };
  const span = (dayIndex: number, days: number, row: number) => ({
    event: event(MONDAY, MONDAY, { allDay: true }),
    dayIndex,
    days,
    row,
  });

  it("is the deepest row among the banners on screen, not on the strip", () => {
    expect(allDayRowCount([span(7, 1, 0), span(8, 2, 1), span(0, 1, 4)], window)).toBe(2);
  });

  it("is zero when nothing on screen has a banner", () => {
    expect(allDayRowCount([span(0, 1, 0)], window)).toBe(0);
    expect(allDayRowCount([], window)).toBe(0);
  });
});

describe("marqueeBox", () => {
  it("normalises a box dragged up and to the left", () => {
    expect(marqueeBox({ fromDay: 3, fromMinutes: 600, toDay: 1, toMinutes: 480 }, HOUR_PX, 100)).toEqual({
      left: 100,
      top: 8 * HOUR_PX,
      width: 200,
      height: 2 * HOUR_PX,
    });
  });

  it("is a point where the pointer has not moved", () => {
    expect(marqueeBox({ fromDay: 2, fromMinutes: 90, toDay: 2, toMinutes: 90 }, HOUR_PX, 100)).toEqual({
      left: 200,
      top: 1.5 * HOUR_PX,
      width: 0,
      height: 0,
    });
  });
});

describe("travelBandBox", () => {
  const block = { top: 10 * HOUR_PX, height: HOUR_PX };

  it("runs from when you'd have to leave down to the block's middle", () => {
    expect(travelBandBox(block, 30, HOUR_PX)).toEqual({
      top: 9.5 * HOUR_PX,
      height: HOUR_PX / 2 + HOUR_PX / 2,
      visible: HOUR_PX / 2,
      labelled: true,
    });
  });

  it("stays a hatch when there is no room for words", () => {
    const band = travelBandBox(block, 10, HOUR_PX);
    expect(band?.visible).toBe(8);
    expect(band?.labelled).toBe(false);
  });

  it("is nothing for a journey too short to draw", () => {
    expect(travelBandBox(block, 1, HOUR_PX)).toBeNull();
  });

  it("is cut at midnight rather than drawn into the day before", () => {
    const band = travelBandBox({ top: HOUR_PX, height: HOUR_PX }, 120, HOUR_PX);
    expect(band?.top).toBe(0);
    expect(band?.visible).toBe(HOUR_PX);
  });
});
