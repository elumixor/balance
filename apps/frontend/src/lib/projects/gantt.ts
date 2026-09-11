/** A run of days, both ends included — what one bar covers. */
export interface Span {
  readonly start: string;
  readonly end: string;
}

/** How far apart two days are drawn. The name is what the control offers to zoom to. */
export interface Scale {
  readonly key: ScaleKey;
  readonly label: string;
  readonly dayWidth: number;
  /** What one column of the lower header row covers. */
  readonly tick: "day" | "week" | "month";
  /** Whether a day column has room to say which weekday it is. */
  readonly weekdays: boolean;
}

export type ScaleKey = "week" | "month" | "quarter" | "year";

/** One column of the header: a day, a week, a month or a year, placed like a bar. */
export interface Tick {
  readonly key: string;
  readonly label: string;
  readonly left: number;
  readonly width: number;
  readonly weekend: boolean;
  readonly today: boolean;
}

/** Where a bar sits, and whether it runs off either end of what is drawn. */
export interface Placement {
  readonly left: number;
  readonly width: number;
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
}

/** What a pointer is doing to a bar: carrying the whole of it, or one of its two edges. */
export type DragMode = "move" | "start" | "end";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
/** A window narrower than a screen has nothing to scroll and nothing to say either side of now. */
const MIN_WINDOW_PX = 1600;
/** A bar of one day at the year scale is three pixels, which nobody can hit. */
const MIN_BAR_PX = 6;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SCALES: readonly Scale[] = [
  { key: "week", label: "Week", dayWidth: 52, tick: "day", weekdays: true },
  { key: "month", label: "Month", dayWidth: 26, tick: "day", weekdays: false },
  { key: "quarter", label: "Quarter", dayWidth: 9, tick: "week", weekdays: false },
  { key: "year", label: "Year", dayWidth: 3.2, tick: "month", weekdays: false },
];

export const DEFAULT_SCALE: ScaleKey = "month";

export function scaleOf(key: ScaleKey): Scale {
  return SCALES.find((scale) => scale.key === key) ?? SCALES[1];
}

export function addDays(day: string, count: number): string {
  return new Date(dateOf(day).getTime() + count * MS_PER_DAY).toISOString().slice(0, 10);
}

/** How many days from `from` to `to`, so the same day is zero and tomorrow is one. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / MS_PER_DAY);
}

/** The smallest run of days covering all of them, or null when there are none. */
export function unionOf(spans: readonly (Span | null)[]): Span | null {
  const known = spans.filter((span): span is Span => span !== null);
  return known.length === 0 ? null : coveringOf(known);
}

/**
 * What a row covers: its own days when it has them, and otherwise everything under it. A plan can
 * be written from the top down — a parent dated, its subtasks not yet — or from the bottom up,
 * and neither leaves a row without a bar.
 */
export function spanOf<
  T extends { id: string; parentId: string | null; startsOn: string | null; endsOn: string | null },
>(id: string, rows: readonly T[]): Span | null {
  const row = rows.find((one) => one.id === id);
  if (!row) return null;
  if (row.startsOn)
    return { start: row.startsOn, end: row.endsOn && row.endsOn > row.startsOn ? row.endsOn : row.startsOn };
  const children = rows.filter((one) => one.parentId === id && one.id !== id);
  return unionOf(children.map((child) => spanOf(child.id, rows)));
}

/**
 * The run of days the grid can be scrolled across: everything dated and today, widened to whole
 * months so a header column is never half a month, and then to at least a screenful so there is
 * somewhere to scroll and room either side of now to drag something into.
 */
export function windowOf(spans: readonly (Span | null)[], today: string, scale: Scale): Span {
  const known = spans.filter((span): span is Span => span !== null);
  const union = coveringOf([{ start: today, end: today }, ...known]);
  const start = monthStart(union.start);
  const end = monthEnd(union.end);
  const needed = Math.ceil(MIN_WINDOW_PX / scale.dayWidth);
  const days = daysBetween(start, end) + 1;
  return days >= needed ? { start, end } : { start, end: monthEnd(addDays(end, needed - days)) };
}

export function widthOf(window: Span, scale: Scale): number {
  return (daysBetween(window.start, window.end) + 1) * scale.dayWidth;
}

/** Where a day's column starts, in pixels from the left of the window. */
export function offsetOf(day: string, window: Span, scale: Scale): number {
  return daysBetween(window.start, day) * scale.dayWidth;
}

/** Which day a pointer is over — the inverse of `offsetOf`, clamped to what is drawn. */
export function dayAt(x: number, window: Span, scale: Scale): string {
  const total = daysBetween(window.start, window.end);
  return addDays(window.start, Math.min(Math.max(Math.floor(x / scale.dayWidth), 0), total));
}

/** Where a bar sits in the window, clipped to it, saying which ends it was clipped at. */
export function placeOf(span: Span, window: Span, scale: Scale): Placement {
  const total = daysBetween(window.start, window.end) + 1;
  const from = daysBetween(window.start, span.start);
  const to = daysBetween(window.start, span.end) + 1;
  const left = Math.max(from, 0);
  const right = Math.min(to, total);
  return {
    left: left * scale.dayWidth,
    width: Math.max((right - left) * scale.dayWidth, MIN_BAR_PX),
    clippedStart: from < 0,
    clippedEnd: to > total,
  };
}

/** What a bar becomes after a pointer has carried it, or one of its edges, so many days. */
export function dragged(span: Span, mode: DragMode, days: number): Span {
  if (mode === "move") return { start: addDays(span.start, days), end: addDays(span.end, days) };
  if (mode === "start") {
    const start = addDays(span.start, days);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, days);
  return { start: span.start, end: end < span.start ? span.start : end };
}

/** The lower header row, and the lines behind the bars: one column per day, week or month. */
export function ticksOf(window: Span, scale: Scale, today: string): Tick[] {
  const total = daysBetween(window.start, window.end) + 1;
  const ticks: Tick[] = [];
  let offset = 0;
  while (offset < total) {
    const day = addDays(window.start, offset);
    const next = nextOffset(window, scale, offset, total);
    const weekday = dateOf(day).getUTCDay();
    ticks.push({
      key: day,
      label: tickLabel(day, scale),
      left: offset * scale.dayWidth,
      width: (next - offset) * scale.dayWidth,
      weekend: scale.tick === "day" && (weekday === 0 || weekday === 6),
      today: scale.tick === "day" && day === today,
    });
    offset = next;
  }
  return ticks;
}

/** The upper header row: the month each stretch of columns belongs to, or the year at that scale. */
export function periodsOf(window: Span, scale: Scale): Tick[] {
  const periods: Tick[] = [];
  let day = window.start;
  while (day <= window.end) {
    const last = scale.tick === "month" ? yearEnd(day) : monthEnd(day);
    const end = last < window.end ? last : window.end;
    periods.push({
      key: day,
      label: periodLabel(day, scale),
      left: offsetOf(day, window, scale),
      width: (daysBetween(day, end) + 1) * scale.dayWidth,
      weekend: false,
      today: false,
    });
    day = addDays(end, 1);
  }
  return periods;
}

function nextOffset(window: Span, scale: Scale, offset: number, total: number): number {
  const day = addDays(window.start, offset);
  if (scale.tick === "day") return offset + 1;
  const step = scale.tick === "week" ? DAYS_PER_WEEK - mondayIndex(day) : daysBetween(day, monthEnd(day)) + 1;
  return Math.min(offset + step, total);
}

function tickLabel(day: string, scale: Scale): string {
  const date = dateOf(day);
  if (scale.tick === "month") return MONTHS[date.getUTCMonth()];
  if (scale.tick === "week") return `${date.getUTCDate()}`;
  return scale.weekdays ? `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}` : `${date.getUTCDate()}`;
}

function periodLabel(day: string, scale: Scale): string {
  const date = dateOf(day);
  return scale.tick === "month" ? `${date.getUTCFullYear()}` : `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function coveringOf(spans: readonly Span[]): Span {
  return spans.reduce((covering, span) => ({
    start: span.start < covering.start ? span.start : covering.start,
    end: span.end > covering.end ? span.end : covering.end,
  }));
}

function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Monday is nought: a week column that opens the window is the stub of one, not a whole week. */
function mondayIndex(day: string): number {
  return (dateOf(day).getUTCDay() + 6) % DAYS_PER_WEEK;
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function monthEnd(day: string): string {
  const date = dateOf(day);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function yearEnd(day: string): string {
  return `${day.slice(0, 4)}-12-31`;
}
