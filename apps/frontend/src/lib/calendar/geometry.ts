import { clamp } from "$lib/core/math";
import { addDays, DAYS_PER_WEEK, daysBetween, MINUTES_PER_DAY } from "./dates";
import { snapMinutes } from "./week-grid";

/**
 * Where a pointer is on the week grid, in the grid's own units: a continuous day index across the
 * drawn strip, and minutes into the day. Everything here is a function of the strip's box on
 * screen; nothing reads the DOM, so the maths can be checked without one.
 */

/**
 * Three weeks of columns, so there's a week to scroll into on either side of the ones shown.
 *
 * A wider strip would be a week's worth of requests spent on days nobody has asked for. Scrolling
 * into a week that hasn't arrived draws its columns empty and fills them a moment later, which is
 * the right way round: the grid is the screen, and the events are what lands in it.
 */
export const SIDE_WEEKS = 1;
export const STRIP_WEEKS = 2 * SIDE_WEEKS + 1;
export const STRIP_DAYS = STRIP_WEEKS * DAYS_PER_WEEK;

/** The strip's rectangle on screen — what `getBoundingClientRect` says about the columns element. */
export type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;
export type Point = { readonly clientX: number; readonly clientY: number };

export interface GridPoint {
  readonly dayIndex: number;
  readonly minutes: number;
}

/** Where a move drag currently puts a block: its column, snapped and unsnapped — see `pointerToSlot`. */
export interface DragSlot {
  readonly day: Date;
  readonly index: number;
  readonly minutes: number;
  readonly rawMinutes: number;
  readonly rawIndex: number;
}

/**
 * Where the pointer is in the grid's own units, with nothing added or rounded off.
 *
 * The grid is exactly one day tall, but a drag doesn't stop at its edges: minutes come back
 * unheld, so a pointer above the top reads negative and one below the foot reads past 1440.
 * That's what carries a block or an edge into the day on either side of the one it's over.
 */
export function pointerToRaw(box: Box, at: Point): GridPoint {
  return {
    dayIndex: clamp(((at.clientX - box.left) / box.width) * STRIP_DAYS, 0, STRIP_DAYS),
    minutes: ((at.clientY - box.top) / box.height) * MINUTES_PER_DAY,
  };
}

/** The same point held inside the day — what a rectangle drawn on the grid can actually show. */
export function pointerToPoint(box: Box, at: Point): GridPoint {
  const raw = pointerToRaw(box, at);
  return { dayIndex: raw.dayIndex, minutes: clamp(raw.minutes, 0, MINUTES_PER_DAY) };
}

/**
 * Where a dragged block's top-left corner lands: the column it's over, and minutes from that
 * column's midnight, which may run past either end of it — dragging down through the foot of the
 * grid carries the block into tomorrow morning, and up through the top into last night.
 *
 * `grab` is the gap between the pointer and the block's corner at grab time, so the block doesn't
 * jump to put that corner under the pointer once dragging starts.
 */
export function pointerToSlot(
  box: Box,
  at: Point,
  stripStart: Date,
  grab: { readonly days: number; readonly minutes: number },
): DragSlot {
  const raw = pointerToRaw(box, at);
  const rawIndex = clamp(raw.dayIndex + grab.days, 0, STRIP_DAYS - 1);
  const index = Math.round(rawIndex);
  const rawMinutes = raw.minutes + grab.minutes;
  return {
    day: addDays(stripStart, index),
    index,
    minutes: snapMinutes(rawMinutes),
    rawMinutes,
    rawIndex,
  };
}

/**
 * Where a dragged edge is, in minutes from the start of `day` — past 1440 when the pointer has
 * moved into a later column or below the grid, negative when it's in an earlier one or above.
 *
 * The column is the one the pointer is inside, floored rather than rounded: an edge is being
 * pointed at, not a block being dropped, so the nearest column boundary isn't what's meant.
 * `grabMinutes` is the gap between the pointer and the edge at grab time — see `edgeAt`.
 */
export function pointerToEdge(
  box: Box,
  at: Point,
  stripStart: Date,
  day: Date,
  grabMinutes: number,
): { readonly minutes: number; readonly rawMinutes: number } {
  const raw = pointerToRaw(box, at);
  const column = clamp(Math.floor(raw.dayIndex), 0, STRIP_DAYS - 1);
  const anchor = daysBetween(stripStart, day);
  const minutes = raw.minutes + grabMinutes;
  return {
    minutes: insideStrip(column, snapMinutes(minutes), anchor),
    rawMinutes: insideStrip(column, minutes, anchor),
  };
}

/** Where the pointer reads as an edge on `day`, before any grab offset. */
export function edgeAt(box: Box, at: Point, stripStart: Date, day: Date): number {
  return pointerToEdge(box, at, stripStart, day, 0).rawMinutes;
}

/**
 * Minutes counted from column `column`, re-counted from day `anchor`, and held inside the drawn
 * strip — a drag can't reach a day that isn't there, or the drop target couldn't be seen. A block
 * being dragged passes its `length` so its far end stops at the edge too.
 */
export function insideStrip(column: number, minutes: number, anchor: number, length = 0): number {
  const room = STRIP_DAYS * MINUTES_PER_DAY - length;
  return clamp(column * MINUTES_PER_DAY + minutes, 0, room) - anchor * MINUTES_PER_DAY;
}

/** The instant `minutes` after `day`'s midnight — negative or past 1440 lands on the days either side. */
export function instantAt(day: Date, minutes: number): Date {
  const at = new Date(day);
  at.setMinutes(minutes);
  return at;
}
