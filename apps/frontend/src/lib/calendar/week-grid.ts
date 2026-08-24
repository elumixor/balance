import { addDays, MINUTES_PER_DAY, minutesIntoDay, startOfDay } from "$lib/dates";
import type { CalendarEvent } from "$lib/types";

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
/** Where the scroller opens, and where a block stops being wide enough to say anything. */
export const OPENING_HOUR = 7;
export const NARROW_BLOCK_PERCENT = 34;
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
 */
export function gutterTicks(hourPx: number): TimeTick[] {
  const step =
    hourPx < CROWDED_HOUR_PX ? 120 : hourPx < HALF_HOUR_LINE_PX ? 60 : hourPx < QUARTER_HOUR_LINE_PX ? 30 : 15;
  const ticks: TimeTick[] = [];
  for (let minutes = step; minutes < MINUTES_PER_DAY; minutes += step) {
    const minute = minutes % 60;
    ticks.push({
      minutes,
      label: `${pad(Math.floor(minutes / 60))}:${pad(minute)}`,
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

export interface PlacedSegment extends Segment {
  readonly top: number;
  readonly height: number;
  readonly leftPercent: number;
  readonly widthPercent: number;
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

  // Greedily drop each span into the first row whose occupied days don't overlap it, so a week
  // with two overlapping banners grows to two rows instead of stacking them on top of each other.
  const rowEnds: number[] = [];
  return spans.map((span) => {
    const lastDay = span.dayIndex + span.days;
    let row = rowEnds.findIndex((end) => end <= span.dayIndex);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = lastDay;
    return { ...span, row };
  });
}

/**
 * Packs one day's segments into columns so overlapping events sit side by side. Segments are
 * grouped into runs that actually collide, so a busy morning doesn't narrow a quiet evening.
 */
export function placeDay(segments: readonly Segment[], hourPx: number = HOUR_PX): PlacedSegment[] {
  const minBlockPx = (SNAP_MINUTES / 60) * hourPx;
  // Earliest first, and the longest of a simultaneous pair takes the leftmost column.
  const ordered = [...segments].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

  const placed: PlacedSegment[] = [];
  let cluster: { segment: Segment; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    const widthPercent = 100 / columnEnds.length;
    // Segments arrive in start order, so grouping by column keeps each column's own start order.
    const byColumn = new Map<number, { segment: Segment; column: number }[]>();
    for (const entry of cluster) {
      const list = byColumn.get(entry.column) ?? [];
      list.push(entry);
      byColumn.set(entry.column, list);
    }

    for (const list of byColumn.values()) {
      for (let i = 0; i < list.length; i++) {
        const { segment, column } = list[i];
        const top = (segment.startMinutes / 60) * hourPx;
        const desired = Math.max(minBlockPx, ((segment.endMinutes - segment.startMinutes) / 60) * hourPx);
        const next = list[i + 1];
        const available = next ? (next.segment.startMinutes / 60) * hourPx - top : Infinity;
        placed.push({
          ...segment,
          top,
          height: Math.max(1, Math.min(desired, available)),
          leftPercent: column * widthPercent,
          widthPercent,
        });
      }
    }
    cluster = [];
    columnEnds = [];
  };

  for (const segment of ordered) {
    if (segment.startMinutes >= clusterEnd && cluster.length > 0) closeCluster();

    let column = columnEnds.findIndex((end) => end <= segment.startMinutes);
    if (column === -1) column = columnEnds.push(segment.endMinutes) - 1;
    else columnEnds[column] = segment.endMinutes;

    cluster.push({ segment, column });
    clusterEnd = Math.max(clusterEnd, segment.endMinutes);
  }
  if (cluster.length > 0) closeCluster();

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
    spans.push({ dayOffset, startMinutes: from - dayStart, endMinutes: to - dayStart });
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
  return Math.round((startOfDay(date).getTime() - startOfDay(rangeStart).getTime()) / (24 * 60 * 60 * 1000));
}
