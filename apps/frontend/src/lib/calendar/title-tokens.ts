import { formatDayDate } from "$lib/format";

/**
 * The event's name, with what it is and when it runs written into the same line as tokens:
 *
 *   @project:<id>                 the project it is for
 *   @practice:<id>                or the practice
 *   @when:<spec>                  a day, a time, a span, or any of them together —
 *                                 2026-10-14 | 13:30 | 13:30-14:30 | 2026-10-14T13:30-14:30
 *   @dur:<minutes>                how long it runs
 *
 * The editor draws every token as a pill and everything else as the name. Nothing is stored in
 * this form: it is composed from the event when the name is focused and resolved back into the
 * event's own fields on every edit.
 */
export const TOKEN_RE = /@(project|practice|when|dur):([^\s@]+)/g;

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "project"; id: string }
  | { kind: "practice"; id: string }
  | { kind: "when"; date: string | null; start: string | null; end: string | null }
  | { kind: "dur"; minutes: number };

export type When = Extract<Segment, { kind: "when" }>;

const DATE = "\\d{4}-\\d{2}-\\d{2}";
const CLOCK = "\\d{2}:\\d{2}";
const WHEN_RE = new RegExp(`^(?:(${DATE})(?:T(${CLOCK})(?:-(${CLOCK}))?)?|(${CLOCK})(?:-(${CLOCK}))?)$`);

export function parseWhen(spec: string): When | null {
  const m = WHEN_RE.exec(spec);
  if (!m) return null;
  const [, date, start, end, bareStart, bareEnd] = m;
  return { kind: "when", date: date ?? null, start: start ?? bareStart ?? null, end: end ?? bareEnd ?? null };
}

export function whenToken(when: Pick<When, "date" | "start" | "end">): string {
  const clock = when.start ? (when.end ? `${when.start}-${when.end}` : when.start) : "";
  const spec = when.date ? (clock ? `${when.date}T${clock}` : when.date) : clock;
  return `@when:${spec}`;
}

export function tokenOf(seg: Exclude<Segment, { kind: "text" }>): string {
  switch (seg.kind) {
    case "project":
      return `@project:${seg.id}`;
    case "practice":
      return `@practice:${seg.id}`;
    case "dur":
      return `@dur:${seg.minutes}`;
    case "when":
      return whenToken(seg);
  }
}

export function parseSegments(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const [full, type, value] = m;
    const at = m.index;
    if (at > last) segs.push({ kind: "text", value: text.slice(last, at) });
    last = at + full.length;
    if (type === "project" || type === "practice") segs.push({ kind: type, id: value });
    else if (type === "dur" && /^\d+$/.test(value)) segs.push({ kind: "dur", minutes: Number(value) });
    else {
      const when = type === "when" ? parseWhen(value) : null;
      segs.push(when ?? { kind: "text", value: full });
    }
  }
  if (last < text.length) segs.push({ kind: "text", value: text.slice(last) });
  return segs;
}

// --- labels ----------------------------------------------------------------------------------

const EN_DASH = "–";
const MS_PER_DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Today", "Tomorrow", "Yesterday", or the day as the rest of the calendar says it. */
export function dayLabel(day: string, now: Date): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date.getTime() - today.getTime()) / MS_PER_DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDayDate(date);
}

export function whenLabel(when: Pick<When, "date" | "start" | "end">, now: Date): string {
  const clock = when.start ? (when.end ? `${when.start} ${EN_DASH} ${when.end}` : when.start) : "";
  if (!when.date) return clock;
  const day = dayLabel(when.date, now);
  return clock ? `${day}, ${clock}` : day;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// --- to and from the event ---------------------------------------------------------------------

export interface TitleFields {
  readonly title: string;
  /** YYYY-MM-DD */
  readonly date: string;
  /** HH:MM */
  readonly from: string;
  readonly to: string;
  readonly projectId: string | null;
  readonly practiceId: string | null;
}

/** The line the editor opens with: the name, then the day, the span and the purpose as pills. */
export function compose(fields: TitleFields): string {
  const purpose = fields.projectId
    ? [`@project:${fields.projectId}`]
    : fields.practiceId
      ? [`@practice:${fields.practiceId}`]
      : [];
  const pills = [
    whenToken({ date: fields.date, start: null, end: null }),
    whenToken({ date: null, start: fields.from, end: fields.to }),
    ...purpose,
  ];
  return [fields.title, ...pills].filter(Boolean).join(" ");
}

const MINUTES_PER_DAY = 24 * 60;

function toMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}

function toClock(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** A span's length in minutes, counting one that ends before it starts as running past midnight. */
export function spanMinutes(from: string, to: string): number {
  const length = toMinutes(to) - toMinutes(from);
  return length > 0 ? length : length + MINUTES_PER_DAY;
}

/**
 * What the line now says the event is. Every field the pills don't mention keeps its current
 * value, so deleting the time pill and typing "1h" moves only the end; the purpose is the one
 * exception, because its pill being gone is how it is taken off.
 */
export function resolve(text: string, current: TitleFields): TitleFields {
  const segs = parseSegments(text);
  const title = segs
    .flatMap((s) => (s.kind === "text" ? [s.value] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  let date = current.date;
  let from = current.from;
  let end: string | null = null;
  let duration: number | null = null;
  let projectId: string | null = null;
  let practiceId: string | null = null;
  for (const seg of segs) {
    if (seg.kind === "when") {
      date = seg.date ?? date;
      from = seg.start ?? from;
      if (seg.end) {
        end = seg.end;
        duration = null;
      }
    } else if (seg.kind === "dur") {
      duration = seg.minutes;
      end = null;
    } else if (seg.kind === "project") {
      projectId = seg.id;
      practiceId = null;
    } else if (seg.kind === "practice") {
      practiceId = seg.id;
      projectId = null;
    }
  }
  const to = end ?? toClock(toMinutes(from) + (duration ?? spanMinutes(current.from, current.to)));
  return { title, date, from, to, projectId, practiceId };
}
