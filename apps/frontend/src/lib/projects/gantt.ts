/** A run of days, both ends included — what one bar covers. */
export interface Span {
  readonly start: string;
  readonly end: string;
}

/** One column of the grid behind the bars: a week, named by the month it starts in. */
export interface Column {
  readonly key: string;
  readonly label: string;
  readonly leftPercent: number;
  readonly widthPercent: number;
}

export interface Bar {
  readonly leftPercent: number;
  readonly widthPercent: number;
}

const MS_PER_DAY = 86_400_000;
/** A timeline shorter than this says nothing about where anything sits. */
const MIN_DAYS = 21;
const PAD_DAYS = 3;
const DAYS_PER_WEEK = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * MS_PER_DAY).toISOString().slice(0, 10);
}

/** How many days from `from` to `to`, so the same day is zero and tomorrow is one. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** The smallest run of days covering all of them, or null when there are none. */
export function unionOf(spans: readonly (Span | null)[]): Span | null {
  const known = spans.filter((span): span is Span => span !== null);
  return known.length === 0 ? null : coveringOf(known);
}

function coveringOf(spans: readonly [Span, ...Span[]] | readonly Span[]): Span {
  return spans.reduce((covering, span) => ({
    start: span.start < covering.start ? span.start : covering.start,
    end: span.end > covering.end ? span.end : covering.end,
  }));
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
 * The window the grid draws: everything dated, today, and a few days either side so a bar never
 * touches the edge. An empty plan still gets three weeks, since a grid with no width is a line.
 */
export function boundsOf(spans: readonly (Span | null)[], today: string): Span {
  const known = spans.filter((span): span is Span => span !== null);
  const union = coveringOf([{ start: today, end: today }, ...known]);
  const start = addDays(union.start, -PAD_DAYS);
  const end = addDays(union.end, PAD_DAYS);
  const days = daysBetween(start, end) + 1;
  return { start, end: days < MIN_DAYS ? addDays(start, MIN_DAYS - 1) : end };
}

/** Where a bar sits in the window, as the two percentages a style needs. */
export function barOf(span: Span, bounds: Span): Bar {
  const total = daysBetween(bounds.start, bounds.end) + 1;
  const from = Math.max(0, daysBetween(bounds.start, span.start));
  const to = Math.min(total, daysBetween(bounds.start, span.end) + 1);
  return { leftPercent: (from / total) * 100, widthPercent: (Math.max(to - from, 1) / total) * 100 };
}

/** The weekly columns behind the bars, the first one clipped to where the window starts. */
export function columnsOf(bounds: Span): Column[] {
  const total = daysBetween(bounds.start, bounds.end) + 1;
  const columns: Column[] = [];
  for (let offset = 0; offset < total; offset += DAYS_PER_WEEK) {
    const day = addDays(bounds.start, offset);
    const width = Math.min(DAYS_PER_WEEK, total - offset);
    columns.push({
      key: day,
      label: labelFor(day, offset === 0),
      leftPercent: (offset / total) * 100,
      widthPercent: (width / total) * 100,
    });
  }
  return columns;
}

/** A column says its month when it opens one, and its day of the month otherwise. */
function labelFor(day: string, first: boolean) {
  const date = new Date(`${day}T00:00:00Z`);
  const month = MONTHS[date.getUTCMonth()];
  return first || date.getUTCDate() <= DAYS_PER_WEEK ? `${month} ${date.getUTCDate()}` : `${date.getUTCDate()}`;
}
