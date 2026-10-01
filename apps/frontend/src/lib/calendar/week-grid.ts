import { addDays, daysBetween, MINUTES_PER_DAY, minutesIntoDay } from "./dates";
import type { CalendarEvent } from "./types";

/** An hour's height at rest. Pinching scales it — see `time-scale.svelte.ts`. */
export const HOUR_PX = 48;
export const SNAP_MINUTES = 15;
export const MIN_BLOCK_PX = (SNAP_MINUTES / 60) * HOUR_PX;
/**
 * How tall an hour may be pinched to. Past this a quarter-hour block is taller than the editor it
 * opens, and the grid says less per screen the harder you look at it.
 *
 * There is no constant for the other end: the floor is whatever height makes the whole day fit the
 * window, since a grid shorter than the window is empty space nobody asked for — see
 * `TimeScale.fit`.
 */
export const MAX_HOUR_PX = 3 * HOUR_PX;
/**
 * Where a half-hour and then a quarter-hour line is worth drawing: only once that division is far
 * enough apart to be read as a rung rather than as hatching. Below them the hour lines say
 * everything the grid can say at that scale.
 */
export const HALF_HOUR_LINE_PX = 72;
/** Below this the hours are closer together than a label is tall, so only every second one is named. */
export const CROWDED_HOUR_PX = 32;
export const QUARTER_HOUR_LINE_PX = 120;
export const DEFAULT_EVENT_MINUTES = 60;
/** Where the scroller opens. */
export const OPENING_HOUR = 7;
/** The gutter every block leaves on the right of its column, timed blocks and all-day alike. */
export const BLOCK_GUTTER_PX = 10;

/** One family of horizontal rules: how often it repeats, and how strongly it's drawn. */
export interface GridLine {
  readonly minutes: number;
  /** Percent of the line colour, the rest transparent — a finer division is a fainter one. */
  readonly mix: number;
}

/**
 * The rules drawn behind the day, coarsest first — which is also the order they have to be painted
 * in, since a later layer sits under an earlier one and the hour must win where they coincide.
 *
 * Pinching in doesn't just make the same grid bigger: it buys detail. An hour tall enough to hold
 * a half-hour rung gets one, and taller still gets quarters, so what the grid measures follows what
 * the scale can actually show.
 */
export function gridLines(hourPx: number): GridLine[] {
  const lines: GridLine[] = [{ minutes: 60, mix: 100 }];
  if (hourPx >= HALF_HOUR_LINE_PX) lines.push({ minutes: 30, mix: 45 });
  if (hourPx >= QUARTER_HOUR_LINE_PX) lines.push({ minutes: 15, mix: 22 });
  return lines;
}

/** A label in the hours' column: how far into the day it sits, and how loudly it's drawn. */
export interface TimeTick {
  readonly minutes: number;
  readonly label: string;
  /** Whole hours are drawn louder than the divisions between them. */
  readonly major: boolean;
}

/**
 * What the hours' column says at this scale.
 *
 * It follows the rules behind the grid — see `gridLines` — because a line the eye can pick out is
 * one it will want named, and a column of numbers denser than the lines they belong to reads as
 * noise. Squeezed the other way the hours themselves thin out to every second one, since a label is
 * taller than the gap between two hours down there.
 *
 * Every label is the whole clock time — a bare `:30` makes you find the hour above it before it
 * means anything, which is work the column exists to save.
 *
 * Midnight is left out: it sits on the very top edge of the grid, where half of it would be cut off.
 *
 * A second zone's column is the same ticks read on another clock: `shiftMinutes` is how far ahead
 * of the grid's own zone it runs, and only the labels move.
 */
export function gutterTicks(hourPx: number, shiftMinutes = 0): TimeTick[] {
  const step =
    hourPx < CROWDED_HOUR_PX ? 120 : hourPx < HALF_HOUR_LINE_PX ? 60 : hourPx < QUARTER_HOUR_LINE_PX ? 30 : 15;
  const ticks: TimeTick[] = [];
  for (let minutes = step; minutes < MINUTES_PER_DAY; minutes += step) {
    const minute = minutes % 60;
    const shown = (((minutes + shiftMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    ticks.push({
      minutes,
      label: `${pad(Math.floor(shown / 60))}:${pad(shown % 60)}`,
      major: minute === 0,
    });
  }
  return ticks;
}

const pad = (n: number) => n.toString().padStart(2, "0");

export interface Segment {
  readonly event: CalendarEvent;
  readonly dayIndex: number;
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

/**
 * A segment with its box worked out, in pixels of its day column. `depth` is how many blocks it
 * sits on top of, and so its stacking order: a block drawn later is drawn over the one it collides
 * with, never beside it.
 */
export interface PlacedSegment extends Segment {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
  readonly depth: number;
}

export interface AllDaySpan {
  readonly event: CalendarEvent;
  readonly dayIndex: number;
  readonly days: number;
  readonly row: number;
}

/**
 * One segment per day an event touches. Splitting here is what makes a midnight-crossing event
 * draw on both days and a three-day event draw on three, without any special case downstream.
 */
export function segmentsForRange(events: readonly CalendarEvent[], rangeStart: Date, dayCount: number): Segment[] {
  const rangeEnd = addDays(rangeStart, dayCount);
  const segments: Segment[] = [];

  for (const event of events) {
    if (event.allDay) continue;
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (end <= rangeStart || start >= rangeEnd) continue;

    const firstDay = Math.max(0, dayIndexOf(start, rangeStart));
    const lastDay = Math.min(dayCount - 1, dayIndexOf(new Date(end.getTime() - 1), rangeStart));

    for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex++) {
      const startsHere = dayIndex === firstDay && start >= rangeStart;
      const endsHere = dayIndex === lastDay && end <= rangeEnd;
      segments.push({
        event,
        dayIndex,
        startMinutes: startsHere ? minutesIntoDay(start) : 0,
        endMinutes: endsHere ? minutesIntoDay(end) || MINUTES_PER_DAY : MINUTES_PER_DAY,
        continuesBefore: !startsHere,
        continuesAfter: !endsHere,
      });
    }
  }

  return segments;
}

/** All-day events sit in their own strip, spanning whole day columns rather than hours. */
export function allDaySpansForRange(
  events: readonly CalendarEvent[],
  rangeStart: Date,
  dayCount: number,
): AllDaySpan[] {
  const rangeEnd = addDays(rangeStart, dayCount);

  const spans = events
    .filter((e) => e.allDay)
    .flatMap((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (end <= rangeStart || start >= rangeEnd) return [];

      const firstDay = Math.max(0, dayIndexOf(start, rangeStart));
      // Google's all-day end date is exclusive, so the last drawn day is the one before it.
      const lastDay = Math.min(dayCount - 1, dayIndexOf(new Date(end.getTime() - 1), rangeStart));
      return [{ event, dayIndex: firstDay, days: lastDay - firstDay + 1 }];
    })
    .sort((a, b) => a.dayIndex - b.dayIndex || b.days - a.days);

  return packRows(spans);
}

/** A run of whole day columns. */
export interface ColumnRun {
  readonly dayIndex: number;
  readonly days: number;
}

/**
 * Greedily drops each span into the first row whose occupied days don't overlap it, so a week with
 * two overlapping banners grows to two rows instead of stacking them on top of each other. Spans
 * are taken in the order given — sort them by first day.
 */
export function packRows<T extends ColumnRun>(spans: readonly T[]): (T & { row: number })[] {
  const rowEnds: number[] = [];
  return spans.map((span) => {
    let row = rowEnds.findIndex((end) => end <= span.dayIndex);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = span.dayIndex + span.days;
    return { ...span, row };
  });
}

/** The width a day column is laid out at when nobody says — tests and previews. */
export const DEFAULT_COLUMN_PX = 160;
/**
 * A block that starts this far below the block it sits inside is drawn nested in it: the parent
 * keeps its title row, the child hangs below it stepped in from the left and running to the same
 * right edge, the way a meeting sits inside the bus ride it happens on. Any closer and the child would cover the parent's name, so it is
 * staggered to the right instead, where both names stay readable.
 */
export const NEST_HEAD_PX = 40;
export const NEST_INSET_PX = 16;
/** Under this much drawn overlap two blocks are back to back, whatever the arithmetic says. */
export const COLLISION_SLACK_PX = 0.5;
/** How far right a staggered block steps: half of the block under it, so both keep a readable half. */
export const STAGGER_FRACTION = 0.5;

/**
 * Lays one day's segments out as a cascade rather than as columns.
 *
 * A block that collides with nothing is full width. One that collides with another is drawn on
 * top of it, never beside it, so no block is ever narrowed by a neighbour it barely touches. Where
 * it goes depends on how the two relate: a block that fits inside another and starts far enough
 * below its top (`NEST_HEAD_PX`) is nested — stepped in from the left under the parent's title row —
 * and any other collision is staggered, stepping `STAGGER_FRACTION` of the way across the block it
 * lands on and running to that block's right edge. Each step is one deeper in the stack.
 *
 * Collisions are measured on the drawn boxes, not the minutes: a short block is drawn at least a
 * quarter-hour tall, and a block starting inside that floor has to be laid out over it or it would
 * be drawn through it.
 */
export function placeDay(
  segments: readonly Segment[],
  hourPx: number = HOUR_PX,
  columnPx: number = DEFAULT_COLUMN_PX,
): PlacedSegment[] {
  const minBlockPx = (SNAP_MINUTES / 60) * hourPx;
  // Earliest first, and the longest of a simultaneous pair goes underneath.
  const ordered = [...segments].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

  const placed: PlacedSegment[] = [];
  for (const segment of ordered) {
    const top = (segment.startMinutes / 60) * hourPx;
    const height = Math.max(minBlockPx, ((segment.endMinutes - segment.startMinutes) / 60) * hourPx);
    const bottom = top + height;

    // The block this one lands on: the latest placed that is still open at this top. Everything
    // placed so far starts at or above it, and each placed block went over every open block before
    // it, so the latest open one is also the one nearest the top of the stack.
    let parent: PlacedSegment | null = null;
    // Half a pixel of slack: `9h + 1h` and `10h` are not always the same float, and a block
    // ending where the next starts must not be read as running into it.
    for (const other of placed) if (other.top + other.height > top + COLLISION_SLACK_PX) parent = other;

    if (!parent) {
      placed.push({
        ...segment,
        top,
        height,
        left: 0,
        width: columnPx - BLOCK_GUTTER_PX,
        depth: 0,
      });
      continue;
    }

    const nested = top - parent.top >= NEST_HEAD_PX && bottom <= parent.top + parent.height;
    const left = parent.left + (nested ? NEST_INSET_PX : parent.width * STAGGER_FRACTION);
    const right = parent.left + parent.width;
    placed.push({
      ...segment,
      top,
      height,
      left,
      width: Math.max(1, right - left),
      depth: parent.depth + 1,
    });
  }

  return placed;
}

/** How thick a resize band gets on a tall block, and how thin one may get before it's dropped. */
export const RESIZE_BAND_MAX_PX = 12;
export const RESIZE_BAND_MIN_PX = 5;
/** What a selected block's bands grow to, since a raised block can spend room it doesn't have. */
export const RESIZE_BAND_SELECTED_PX = 9;

export interface ResizeBands {
  /** Height of each band in pixels, or 0 when the block is too short to carry them. */
  readonly band: number;
  /** How far each band hangs outside the block, so a short selected block still has handles. */
  readonly overhang: number;
}

/**
 * The resize bands for a block of this drawn height.
 *
 * Each band is capped at a third of the block, so the two can never meet and the middle third
 * stays free to answer the tap that opens the event. That leaves a quarter-hour block with nothing
 * aimable, so unselected it carries no bands at all — a target you can't hit is worse than none.
 *
 * Selecting the block is what buys the handles back: a selected block is raised above its
 * neighbours, so its bands can hang outside it and still be the thing the pointer finds. The
 * inside third-and-third split holds either way, so the bands stay in the order they mean.
 */
export function resizeBands(height: number, selected: boolean): ResizeBands {
  const third = height / 3;
  const band = Math.min(RESIZE_BAND_MAX_PX, third);
  if (band >= RESIZE_BAND_MIN_PX) return { band, overhang: 0 };
  if (!selected) return { band: 0, overhang: 0 };
  const grown = Math.min(RESIZE_BAND_MAX_PX, Math.max(RESIZE_BAND_SELECTED_PX, third));
  return { band: grown, overhang: grown - third };
}

/** One piece of a drag, in the column it draws in: an offset in whole days, and minutes into it. */
export interface DaySpan {
  readonly dayOffset: number;
  readonly startMinutes: number;
  readonly endMinutes: number;
}

/**
 * Cuts a range at every midnight it crosses, so a drag that runs past the end of its day draws as
 * one piece per column rather than one rectangle hanging off the bottom of the grid.
 *
 * Minutes are counted from the start of the anchor day and may sit outside it in either direction —
 * an evening-to-morning sleep is `1320 → 1800`, and dragging a start backwards goes negative.
 */
export function daySpans(startMinutes: number, endMinutes: number): DaySpan[] {
  const spans: DaySpan[] = [];
  let from = startMinutes;
  while (from < endMinutes) {
    const dayOffset = Math.floor(from / MINUTES_PER_DAY);
    const dayStart = dayOffset * MINUTES_PER_DAY;
    const to = Math.min(endMinutes, dayStart + MINUTES_PER_DAY);
    spans.push({
      dayOffset,
      startMinutes: from - dayStart,
      endMinutes: to - dayStart,
    });
    from = to;
  }
  return spans;
}

/** Rounds a pointer position to the nearest quarter hour, the finest the grid commits to. */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/**
 * Which column a date falls in, counted in days rather than in hours.
 *
 * The day the clocks go forward is 23 hours long, so dividing the gap by 24 and flooring it puts
 * that Monday — and every day after it — one column to the left for the rest of the strip.
 * Rounding a whole number of local midnights apart is right in both directions.
 */
function dayIndexOf(date: Date, rangeStart: Date): number {
  return daysBetween(rangeStart, date);
}

/**
 * The whole strip's segments, bucketed by column and laid out. One pass rather than a filter per
 * column, which would walk every segment once per column for every change to the events behind
 * them.
 */
export function placeStrip(
  events: readonly CalendarEvent[],
  stripStart: Date,
  dayCount: number,
  hourPx: number,
  columnPx: number,
): PlacedSegment[][] {
  const byDay: Segment[][] = Array.from({ length: dayCount }, () => []);
  // Every segment's day is inside the range it was cut for, so its bucket is always there.
  for (const segment of segmentsForRange(events, stripStart, dayCount)) byDay[segment.dayIndex].push(segment);
  return byDay.map((segments) => placeDay(segments, hourPx, columnPx));
}

/**
 * Which columns of the strip are on screen, and how far past them blocks are still drawn. The
 * strip is wide so a fling always has columns ahead of it, but only the days near the window are
 * worth building: the rest would be a few hundred absolutely-positioned nodes nobody can see,
 * rebuilt on every write. Three days of margin covers the columns a fling exposes between two
 * scroll ticks.
 */
export const DRAW_MARGIN_DAYS = 3;

export interface StripWindow {
  /** The leftmost column on screen. */
  readonly offset: number;
  readonly visibleDays: number;
  readonly stripDays: number;
}

/** The first and last column blocks are built for — the window plus its runway. */
export function drawnBounds(window: StripWindow): { readonly first: number; readonly last: number } {
  return {
    first: Math.max(0, window.offset - DRAW_MARGIN_DAYS),
    last: Math.min(window.stripDays - 1, window.offset + window.visibleDays - 1 + DRAW_MARGIN_DAYS),
  };
}

/** The columns the window is actually over, as against the runway either side of them. */
export function inWindow(index: number, window: StripWindow): boolean {
  return index >= window.offset && index < window.offset + window.visibleDays;
}

/**
 * A column's blocks. The runway — the days built ahead of the window so a fling has something to
 * scroll onto — carries only blocks that have already had their moment: an event nobody has seen
 * yet waits until its column is really on screen, so that its fade happens where it can be
 * watched instead of three days out of view.
 */
export function blocksFor(
  placed: readonly PlacedSegment[],
  index: number,
  window: StripWindow,
  seen: ReadonlySet<string>,
): readonly PlacedSegment[] {
  const { first, last } = drawnBounds(window);
  if (index < first || index > last) return [];
  return inWindow(index, window) ? placed : placed.filter((segment) => seen.has(segment.event.id));
}

/** Whether a span of whole columns touches the days on screen. */
export function spanInWindow(dayIndex: number, days: number, window: StripWindow): boolean {
  return dayIndex + days > window.offset && dayIndex < window.offset + window.visibleDays;
}

/** How many rows the spans over the days on screen take — none when there are none. */
export function allDayRowCount(spans: readonly (ColumnRun & { row: number })[], window: StripWindow): number {
  return spans.reduce(
    (max, span) => (spanInWindow(span.dayIndex, span.days, window) ? Math.max(max, span.row + 1) : max),
    0,
  );
}

/** How many of the spans over the days on screen sit in a row past the first `rows` — what a fold hides. */
export function spansBelow(spans: readonly (ColumnRun & { row: number })[], window: StripWindow, rows: number): number {
  return spans.filter((span) => span.row >= rows && spanInWindow(span.dayIndex, span.days, window)).length;
}

/** A box in the grid's own units — a continuous day index and minutes into the day, both corners unsnapped. */
export interface GridBox {
  readonly fromDay: number;
  readonly fromMinutes: number;
  readonly toDay: number;
  readonly toMinutes: number;
}

export interface PixelBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The gathering box, in pixels down the grid rather than the grid's own day-and-minute units. */
export function marqueeBox(box: GridBox, hourPx: number, columnPx: number): PixelBox {
  return {
    left: Math.min(box.fromDay, box.toDay) * columnPx,
    top: (Math.min(box.fromMinutes, box.toMinutes) / 60) * hourPx,
    width: Math.abs(box.toDay - box.fromDay) * columnPx,
    height: (Math.abs(box.toMinutes - box.fromMinutes) / 60) * hourPx,
  };
}

/** Room for a line of words: below this a travel band stays a hatch and says nothing. */
export const TRAVEL_LABEL_PX = 18;
/** Under this a journey is too short to draw at all. */
export const TRAVEL_BAND_MIN_PX = 2;

export interface TravelBandBox {
  readonly top: number;
  /** Down to the block's middle, so the band and the block read as one thing. */
  readonly height: number;
  /** The part above the block — where the words go. */
  readonly visible: number;
  readonly labelled: boolean;
}

/**
 * The band drawn above a block for the journey to it: from when you'd have to leave to when the
 * block starts. It runs on down behind the block to the block's middle, with no edge of its own
 * at the bottom, so the two read as one thing rather than a box parked over another. A journey
 * that would start before the column does is cut at midnight rather than drawn into yesterday's
 * column.
 */
export function travelBandBox(
  segment: Pick<PlacedSegment, "top" | "height">,
  minutes: number,
  hourPx: number,
): TravelBandBox | null {
  const top = Math.max(0, segment.top - (minutes / 60) * hourPx);
  const visible = segment.top - top;
  if (visible < TRAVEL_BAND_MIN_PX) return null;
  return { top, height: visible + segment.height / 2, visible, labelled: visible >= TRAVEL_LABEL_PX };
}

/** px a slid-out block's caption takes under or over it: one line of text and its gap. */
export const CAPTION_PX = 22;

export type CaptionSide = "below" | "above";

/**
 * Where a block's caption goes: under it when nothing is drawn there, over it when the room is
 * above instead, and under it regardless when both are taken — a halo keeps it readable, and a
 * caption that moved somewhere unexpected would be the harder thing to find. A journey band
 * counts as something above; the top of the grid counts as no room at all.
 */
export function captionSide(
  segment: Pick<PlacedSegment, "top" | "height">,
  others: readonly Pick<PlacedSegment, "top" | "height">[],
  bandAbove: boolean,
  captionPx: number = CAPTION_PX,
): CaptionSide {
  const bottom = segment.top + segment.height;
  const taken = (from: number, to: number) => others.some((o) => o.top < to && o.top + o.height > from);
  if (!taken(bottom, bottom + captionPx)) return "below";
  const above = segment.top - captionPx;
  if (above >= 0 && !bandAbove && !taken(above, segment.top)) return "above";
  return "below";
}
