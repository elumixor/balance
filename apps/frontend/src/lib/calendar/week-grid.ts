import { addDays, DAYS_PER_WEEK, MINUTES_PER_DAY, minutesIntoDay, startOfDay } from "$lib/dates";
import type { CalendarEvent } from "$lib/types";

export const HOUR_PX = 48;
export const SNAP_MINUTES = 15;
export const MIN_BLOCK_PX = 18;
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
}

/**
 * One segment per day an event touches. Splitting here is what makes a midnight-crossing event
 * draw on both days and a three-day event draw on three, without any special case downstream.
 */
export function segmentsForWeek(events: readonly CalendarEvent[], weekStart: Date): Segment[] {
  const weekEnd = addDays(weekStart, DAYS_PER_WEEK);
  const segments: Segment[] = [];

  for (const event of events) {
    if (event.allDay) continue;
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (end <= weekStart || start >= weekEnd) continue;

    const firstDay = Math.max(0, dayIndexOf(start, weekStart));
    const lastDay = Math.min(DAYS_PER_WEEK - 1, dayIndexOf(new Date(end.getTime() - 1), weekStart));

    for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex++) {
      const startsHere = dayIndex === firstDay && start >= weekStart;
      const endsHere = dayIndex === lastDay && end <= weekEnd;
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
export function allDaySpansForWeek(events: readonly CalendarEvent[], weekStart: Date): AllDaySpan[] {
  const weekEnd = addDays(weekStart, DAYS_PER_WEEK);

  return events
    .filter((e) => e.allDay)
    .flatMap((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (end <= weekStart || start >= weekEnd) return [];

      const firstDay = Math.max(0, dayIndexOf(start, weekStart));
      // Google's all-day end date is exclusive, so the last drawn day is the one before it.
      const lastDay = Math.min(DAYS_PER_WEEK - 1, dayIndexOf(new Date(end.getTime() - 1), weekStart));
      return [{ event, dayIndex: firstDay, days: lastDay - firstDay + 1 }];
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
    for (const { segment, column } of cluster) {
      const widthPercent = 100 / columnEnds.length;
      placed.push({
        ...segment,
        top: (segment.startMinutes / 60) * HOUR_PX,
        height: Math.max(MIN_BLOCK_PX, ((segment.endMinutes - segment.startMinutes) / 60) * HOUR_PX),
        leftPercent: column * widthPercent,
        widthPercent,
      });
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

/** Rounds a pointer position to the nearest quarter hour, the finest the grid commits to. */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function dayIndexOf(date: Date, weekStart: Date): number {
  return Math.floor((startOfDay(date).getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
}
