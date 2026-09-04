import { durationLabel, isoDay, whenLabel, whenToken } from "./title-tokens";

/**
 * What a few typed words might mean as a day, a time or a length, offered as pills while the name
 * is being typed. "1h" is a length; "13:30-14:30" a span on the day the event already has; "next
 * tuesday 14:00" moves the day too. A date is day-first — "14.10" is the 14th of October this
 * year, "14.10.27" the same day in 2027 — because that is how the people using this write them.
 */
export interface Suggestion {
  readonly kind: "when" | "dur";
  readonly token: string;
  readonly label: string;
  readonly detail: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_HALF_DAY = 12;
const CENTURY = 2000;
/** How many trailing words are tried as a bare date or time before giving up. */
const LOOKBACK = 4;

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDuration(s: string): number | null {
  const t = s.replace(/\s+/g, "").toLowerCase();
  let m = /^(\d+)h(\d{1,2})m?$/.exec(t);
  if (m) return Number(m[1]) * MINUTES_PER_HOUR + Number(m[2]);
  m = /^(\d+(?:[.,]\d+)?)(h|hr|hrs|hour|hours)$/.exec(t);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * MINUTES_PER_HOUR);
  m = /^(\d+)(m|min|mins|minute|minutes)$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}

interface Clock {
  readonly clock: string;
  /** Whether it was written unmistakably as a time — with minutes or am/pm — not just a number. */
  readonly explicit: boolean;
}

export function parseClock(s: string): Clock | null {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(s.toLowerCase());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const meridiem = m[3];
  if (meridiem) {
    if (hour < 1 || hour > HOURS_PER_HALF_DAY) return null;
    hour = (hour % HOURS_PER_HALF_DAY) + (meridiem === "pm" ? HOURS_PER_HALF_DAY : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return { clock: `${pad(hour)}:${pad(minute)}`, explicit: m[2] !== undefined || meridiem !== undefined };
}

/** "13:30-14:30", "9-10am" — a span written as one word; a shared am/pm applies to both ends. */
function parseSpan(s: string): { start: Clock; end: Clock } | null {
  const m = /^([^-–]+)[-–]([^-–]+)$/.exec(s);
  if (!m) return null;
  const meridiem = /(am|pm)$/i.exec(m[2])?.[1] ?? "";
  const start = parseClock(/(am|pm)$/i.test(m[1]) ? m[1] : m[1] + meridiem);
  const end = parseClock(m[2]);
  return start && end ? { start, end } : null;
}

function dayOf(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return isoDay(d);
}

function parseDay(word: string, now: Date): string | null {
  const t = word.toLowerCase();
  if (t === "today" || t === "tod") return dayOf(now, 0);
  if (t === "tomorrow" || t === "tmr" || t === "tom") return dayOf(now, 1);
  if (t === "yesterday") return dayOf(now, -1);
  const weekday = t.length >= 3 ? WEEKDAYS.findIndex((w) => w.startsWith(t)) : -1;
  if (weekday >= 0) return dayOf(now, (weekday - now.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK);
  let m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(t);
  if (m) {
    const year = m[3] ? Number(m[3]) + (m[3].length === 2 ? CENTURY : 0) : now.getFullYear();
    return validDay(year, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** A day that exists — `Date` would roll the 31st of February into March rather than refuse it. */
function validDay(year: number, month: number, day: number): string | null {
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? isoDay(d) : null;
}

/** "next tuesday", "next week": the one after the coming one, or the same day seven days on. */
function parseNext(word: string, now: Date): string | null {
  const t = word.toLowerCase();
  if (t === "week") return dayOf(now, DAYS_PER_WEEK);
  const weekday = t.length >= 3 ? WEEKDAYS.findIndex((w) => w.startsWith(t)) : -1;
  if (weekday < 0) return null;
  return dayOf(now, ((weekday - now.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK) + DAYS_PER_WEEK);
}

export interface Parsed {
  readonly date: string | null;
  readonly start: string | null;
  readonly end: string | null;
  /** Whether a bare time in it was written as one — see `parseClock`. */
  readonly explicit: boolean;
}

/** "13:30 - 14:30" typed with room around the dash is the same span as "13:30-14:30". */
function joinDashes(words: readonly string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    const last = out.at(-1);
    if (last !== undefined && (/[-–]$/.test(last) || /^[-–]/.test(word))) out[out.length - 1] = last + word;
    else out.push(word);
  }
  return out;
}

/**
 * Every word read as part of one day-and-time, or null if any word means nothing here. "at" and
 * "on" are allowed so "tuesday at 9am" reads as it is said.
 */
export function parseWhen(words: readonly string[], now: Date): Parsed | null {
  let date: string | null = null;
  let start: string | null = null;
  let end: string | null = null;
  let explicit = false;
  const joined = joinDashes(words);
  for (let i = 0; i < joined.length; i++) {
    const word = joined[i];
    const lower = word.toLowerCase();
    if (lower === "at" || lower === "on") continue;
    if (lower === "next") {
      const day = parseNext(joined[i + 1] ?? "", now);
      if (!day) return null;
      date = day;
      i++;
      continue;
    }
    const day = parseDay(word, now);
    if (day) {
      date = day;
      continue;
    }
    if (start) return null;
    const span = parseSpan(word);
    const clock = span?.start ?? parseClock(word);
    if (!clock) return null;
    start = clock.clock;
    end = span?.end.clock ?? null;
    explicit ||= clock.explicit || Boolean(span?.end.explicit);
  }
  if (!date && !start) return null;
  return { date, start, end, explicit };
}

/**
 * Where a bare day, time or length starts at the end of what was typed — "Run 1h" says the pill
 * begins at the "1" — or null. A number on its own is left alone, because "Chapter 9" is a name;
 * a time has to be written with minutes or am/pm to be offered without an "@".
 */
export function matchTrailing(before: string, now: Date): number | null {
  const words: { text: string; start: number }[] = [];
  for (const m of before.matchAll(/\S+/g)) words.push({ text: m[0], start: m.index });
  if (words.length === 0) return null;
  for (let i = Math.max(0, words.length - LOOKBACK); i < words.length; i++) {
    const run = words.slice(i).map((w) => w.text);
    const when = parseWhen(run, now);
    if (when && (when.date || when.explicit)) return words[i].start;
    if (run.length <= 2 && parseDuration(run.join("")) !== null) return words[i].start;
  }
  return null;
}

/** The pills a typed query could become, most likely first — none when it means nothing. */
export function suggest(query: string, now: Date): Suggestion[] {
  const q = query.trim();
  if (!q) {
    return [
      {
        kind: "when",
        token: whenToken({ date: dayOf(now, 0), start: null, end: null }),
        label: "Today",
        detail: "Day",
      },
      {
        kind: "when",
        token: whenToken({ date: dayOf(now, 1), start: null, end: null }),
        label: "Tomorrow",
        detail: "Day",
      },
      { kind: "dur", token: "@dur:30", label: durationLabel(30), detail: "Length" },
      { kind: "dur", token: "@dur:60", label: durationLabel(60), detail: "Length" },
    ];
  }
  const out: Suggestion[] = [];
  const minutes = parseDuration(q);
  if (minutes !== null && minutes > 0) {
    out.push({ kind: "dur", token: `@dur:${minutes}`, label: durationLabel(minutes), detail: "Length" });
  }
  const when = parseWhen(q.split(/\s+/), now);
  if (when) {
    const detail = when.date ? (when.start ? "Day and time" : "Day") : when.end ? "Span" : "Start";
    out.push({ kind: "when", token: whenToken(when), label: whenLabel(when, now), detail });
  }
  return out;
}
