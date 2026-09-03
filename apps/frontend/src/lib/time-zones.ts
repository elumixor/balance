/**
 * Time zones by the names people use for them.
 *
 * The calendar wants "Europe/Kyiv"; a person types "Kyiv" and reads "GMT+2". This turns each
 * into the other: a zone's city, its offset at a given moment, and a search over every zone the
 * runtime knows by any word in it.
 */

export interface ZoneOption {
  /** The IANA name — what the calendar is told. */
  readonly zone: string;
  /** "Kyiv", "New York": the last part of the name, spaces restored. */
  readonly city: string;
}

/** Zones worth offering before anything is typed: the device's own, and the world's anchors. */
const ANCHORS = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Kyiv",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
];

/** How many matches a search shows; past this, another letter is faster than scrolling. */
export const MAX_MATCHES = 12;

/** Cities the runtime still lists under a name the city itself has stopped using. */
const RENAMED: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
};

function cityOf(zone: string) {
  return zone.slice(zone.lastIndexOf("/") + 1).replaceAll("_", " ");
}

/** Every zone the runtime can name, by the name each city uses today. */
export function allZones(): readonly ZoneOption[] {
  const names = Intl.supportedValuesOf("timeZone").map((zone) => RENAMED[zone] ?? zone);
  return [...new Set(names)].map((zone) => ({ zone, city: cityOf(zone) }));
}

/** "GMT+2", "GMT-5:30", "GMT" — the offset a zone has at this instant, since it moves twice a year. */
export function offsetLabel(zone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at);
    const name = parts
      .filter((part) => part.type === "timeZoneName")
      .map((part) => part.value)
      .join("");
    // "GMT+02:00" reads better without the zero minutes, and "GMT+2" is what people write.
    return name.replace(/([+-])0?(\d+):00$/, "$1$2").replace(/([+-])0?(\d+):(\d+)$/, "$1$2:$3");
  } catch {
    return "GMT";
  }
}

/** "CEST", "GMT+3" — the name a column of hours wears, as short as the runtime can make it. */
export function shortZoneName(zone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(at);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

/** Whether the runtime accepts this as a zone at all — a typed name is checked before it's saved. */
export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zones matching what's been typed, city first: "kyiv" finds Europe/Kyiv, "new" finds New York
 * and New Salem, "europe/p" finds Prague and Paris. Empty finds nothing — the caller has its own
 * idea of what to show before typing starts.
 */
export function searchZones(query: string, zones: readonly ZoneOption[] = allZones()): ZoneOption[] {
  const q = query.trim().toLowerCase().replaceAll("_", " ");
  if (!q) return [];
  const starts = (text: string) =>
    text
      .toLowerCase()
      .split(/[\s/]+/)
      .some((word) => word.startsWith(q));
  const ranked = zones
    .map((option) => ({
      option,
      rank: option.city.toLowerCase().startsWith(q)
        ? 0
        : starts(option.city)
          ? 1
          : option.zone.toLowerCase().replaceAll("_", " ").includes(q)
            ? 2
            : 3,
    }))
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.option.city.localeCompare(b.option.city));
  return ranked.slice(0, MAX_MATCHES).map((entry) => entry.option);
}

/** The anchors, with the device's own zone first and never twice. */
export function defaultZones(deviceZone: string): ZoneOption[] {
  return [...new Set([deviceZone, ...ANCHORS])].map((zone) => ({ zone, city: cityOf(zone) }));
}

/** Minutes east of UTC that a zone is at this instant. */
export function offsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The same wall-clock time, read in another zone. Nine in Prague moved to Kyiv is nine in Kyiv —
 * an hour earlier as an instant. Two passes, because the offset at the guessed instant can differ
 * from the offset at the answer when the guess lands across a clock change.
 */
export function shiftZone(at: Date, from: string, to: string): Date {
  const wall = at.getTime() + offsetMinutes(from, at) * 60_000;
  const guess = new Date(wall - offsetMinutes(to, new Date(wall)) * 60_000);
  return new Date(wall - offsetMinutes(to, guess) * 60_000);
}
