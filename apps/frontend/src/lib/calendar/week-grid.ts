import { addDays, MINUTES_PER_DAY, minutesIntoDay, startOfDay } from "$lib/dates";
import type { CalendarEvent } from "$lib/types";

export const HOUR_PX = 48;
export const SNAP_MINUTES = 15;
export const MIN_BLOCK_PX = (SNAP_MINUTES / 60) * HOUR_PX;
export const DEFAULT_EVENT_MINUTES = 60;
/** Where the scroller opens, and where a block stops being wide enough to say anything. */
export const OPENING_HOUR = 7;
export const NARROW_BLOCK_PERCENT = 34;

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
export function placeDay(segments: readonly Segment[]): PlacedSegment[] {
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
        const top = (segment.startMinutes / 60) * HOUR_PX;
        const desired = Math.max(MIN_BLOCK_PX, ((segment.endMinutes - segment.startMinutes) / 60) * HOUR_PX);
        const next = list[i + 1];
        const available = next ? (next.segment.startMinutes / 60) * HOUR_PX - top : Infinity;
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

/** Rounds a pointer position to the nearest quarter hour, the finest the grid commits to. */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function dayIndexOf(date: Date, rangeStart: Date): number {
  return Math.floor((startOfDay(date).getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));
}
