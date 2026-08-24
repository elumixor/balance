/**
 * Reading an `.ics` file — the thing a mail app hands over when somebody sends an invitation, and
 * what a conference or a school timetable publishes as a download.
 *
 * The file is not the calendar and never becomes one: what is parsed here is turned into ordinary
 * events in Google Calendar, which stays the source of truth. So this reads only what an event on
 * the grid can hold — when it is, what it is called, where it is, what the notes say — and drops
 * the rest of the format on the floor: alarms, attendees, free/busy blocks, time zone definitions.
 *
 * Recurrence is read far enough to say "this repeats" and no further. Expanding an RRULE here
 * would mean owning a second implementation of the calendar's own recurrence, and the honest
 * alternative is to import the first occurrence and say so.
 */

/** One VEVENT, resolved into the instants the app works in. */
export interface IcsEvent {
  /** The file's own id for the event, when it carries one. Used to spot the same event twice. */
  readonly uid: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly start: Date;
  /** Exclusive, as iCalendar writes it — an all-day event ends at midnight the following day. */
  readonly end: Date;
  /**
   * A date rather than a moment, and carried as midnight UTC: an all-day event has no zone of its
   * own, and resolving it in this device's one is what would move it a day.
   */
  readonly allDay: boolean;
  /** The event repeats, and only the first occurrence is being imported. */
  readonly recurring: boolean;
}

/** How long an event with no end and no duration lasts. Zero-length is what the file means; a
 * block with no height is not something the week grid can draw or anybody can find again. */
const DEFAULT_DURATION_MS = 60 * 60_000;
const MS_PER_DAY = 24 * 60 * 60_000;

/**
 * Every event the file describes, in the order it lists them. Anything unparseable — a VEVENT
 * with no start, a date nobody can read — is skipped rather than thrown over, because a file with
 * one bad entry out of forty is still worth importing.
 */
export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const block of veventBlocks(unfold(text))) {
    const event = toEvent(block);
    if (event) events.push(event);
  }
  return events;
}

/**
 * A line of iCalendar is at most 75 octets, and anything longer is continued on the next line
 * behind a single space or tab. Undoing that first is what lets everything below read one
 * property per line — a folded URL is otherwise two lines, neither of them a property.
 */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

/**
 * The lines of each VEVENT, with any nested component — a VALARM, in practice — left out. An
 * alarm carries its own DURATION and TRIGGER, and reading those as the event's would give every
 * reminded event the length of its reminder.
 */
function veventBlocks(lines: readonly string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  let nested = 0;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      nested = 0;
      continue;
    }
    if (!current) continue;
    if (line === "END:VEVENT") {
      blocks.push(current);
      current = null;
      continue;
    }
    if (line.startsWith("BEGIN:")) nested += 1;
    else if (line.startsWith("END:")) nested -= 1;
    else if (nested === 0) current.push(line);
  }
  return blocks;
}

interface Property {
  readonly name: string;
  readonly params: Map<string, string>;
  readonly value: string;
}

/**
 * `DTSTART;TZID=Europe/Amsterdam:20260824T090000` — a name, parameters, and everything after the
 * first colon that isn't inside a quoted parameter value. Quoting matters: a TZID with a colon in
 * it is legal, and splitting on the first colon regardless would cut the property in half.
 */
function parseProperty(line: string): Property | null {
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;

  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    params.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).replace(/^"|"$/g, ""));
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function toEvent(block: readonly string[]): IcsEvent | null {
  const properties = new Map<string, Property>();
  for (const line of block) {
    const property = parseProperty(line);
    // First one wins: a file that repeats DTSTART is malformed, and the later copies are noise.
    if (property && !properties.has(property.name)) properties.set(property.name, property);
  }

  // A cancellation is a real event in the file — it is how an organiser withdraws one already in
  // your calendar — and importing it would put back exactly what was called off.
  if (properties.get("STATUS")?.value.toUpperCase() === "CANCELLED") return null;

  const dtstart = properties.get("DTSTART");
  if (!dtstart) return null;
  const start = parseDateTime(dtstart);
  if (!start) return null;

  const end = resolveEnd(properties, start);
  return {
    uid: properties.get("UID")?.value.trim() || null,
    title: unescapeText(properties.get("SUMMARY")?.value ?? "").trim(),
    description: textOrNull(properties.get("DESCRIPTION")),
    location: textOrNull(properties.get("LOCATION")),
    start: start.at,
    end,
    allDay: start.dateOnly,
    recurring: properties.has("RRULE") || properties.has("RDATE"),
  };
}

/** DTEND if there is one, otherwise DTSTART plus DURATION, otherwise a length made up here. */
function resolveEnd(properties: Map<string, Property>, start: { at: Date; dateOnly: boolean }): Date {
  const dtend = properties.get("DTEND");
  const parsedEnd = dtend ? parseDateTime(dtend) : null;
  if (parsedEnd && parsedEnd.at.getTime() > start.at.getTime()) return parsedEnd.at;

  const duration = parseDuration(properties.get("DURATION")?.value ?? "");
  if (duration !== null && duration > 0) return new Date(start.at.getTime() + duration);

  // An all-day event with nothing else said is that one day; a timed one gets an hour, which is
  // the shape of a meeting somebody forgot to put an end on.
  return new Date(start.at.getTime() + (start.dateOnly ? MS_PER_DAY : DEFAULT_DURATION_MS));
}

function textOrNull(property: Property | undefined): string | null {
  const text = unescapeText(property?.value ?? "").trim();
  return text === "" ? null : text;
}

/** `\n`, `\,`, `\;` and `\\` are how iCalendar puts a newline or a comma inside a value. */
function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

const DATE_TIME = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/**
 * A date-time in whichever of the three ways the format allows: a bare date, UTC with a trailing
 * `Z`, a wall clock in a named zone, or a floating wall clock that means "wherever you are".
 */
function parseDateTime(property: Property): { at: Date; dateOnly: boolean } | null {
  const match = DATE_TIME.exec(property.value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utc] = match;
  const parts = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
  ] as const;

  // VALUE=DATE is the declared form, but a value with no time part is one whether it says so or
  // not — and plenty of files don't say so.
  if (hour === undefined || property.params.get("VALUE") === "DATE") {
    return { at: new Date(Date.UTC(parts[0], parts[1], parts[2])), dateOnly: true };
  }
  if (utc) return { at: new Date(Date.UTC(...parts)), dateOnly: false };

  const timeZone = property.params.get("TZID");
  const zoned = timeZone ? zonedToInstant(parts, timeZone) : null;
  // No zone, or a zone this device has never heard of: the wall clock is read as local time,
  // which is both what a floating time means and the least surprising guess for the other.
  return { at: zoned ?? new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]), dateOnly: false };
}

type WallClock = readonly [number, number, number, number, number, number];

/**
 * The instant at which that wall clock reads in that zone. Found by guessing UTC and correcting
 * by the zone's offset — twice, because the offset at the guess and the offset at the answer
 * differ across a DST change, and the second pass is what puts an autumn morning back where the
 * file meant it.
 */
function zonedToInstant(parts: WallClock, timeZone: string): Date | null {
  if (!knownZone(timeZone)) return null;
  const wallClock = Date.UTC(...parts);
  const guess = wallClock - offsetMinutes(new Date(wallClock), timeZone) * 60_000;
  return new Date(wallClock - offsetMinutes(new Date(guess), timeZone) * 60_000);
}

/** Whether this device has heard of the zone at all — a file may name one it doesn't. */
function knownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** How far the zone's wall clock runs ahead of UTC at that instant, in minutes. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second"),
  );
  return (wallClock - at.getTime()) / 60_000;
}

const DURATION = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** `PT1H30M`, `P2D`, `P1W` — milliseconds, or null when the value isn't a duration at all. */
function parseDuration(value: string): number | null {
  const match = DURATION.exec(value.trim());
  if (!match) return null;

  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const total =
    (Number(weeks ?? 0) * 7 + Number(days ?? 0)) * MS_PER_DAY +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1_000;
  return sign === "-" ? -total : total;
}
