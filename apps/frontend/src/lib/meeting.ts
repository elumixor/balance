/**
 * The meeting inside an event: where it happens, and everything you'd otherwise scroll the notes
 * looking for thirty seconds after it started.
 *
 * The calendar answers most of this outright — Google keeps a conferencing block on events made
 * with one. The rest is in the notes, written by whoever sent the invitation, so the links are
 * read back out of the text the same way a person reads them out of it.
 */

export type MeetingProvider = "meet" | "zoom" | "teams" | "webex" | "other";

export interface MeetingLink {
  readonly url: string;
  /** What the button says: "Google Meet", "Zoom", or the site's own name. */
  readonly label: string;
}

export interface Meeting {
  /** The one link that means "you are in the room". Null when the event isn't a call. */
  readonly join: (MeetingLink & { provider: MeetingProvider }) | null;
  /** Everything else worth a button: the doc, the agenda, the ticket. */
  readonly links: MeetingLink[];
  /** Somewhere you have to physically be, as the invitation spells it. */
  readonly location: string | null;
}

/** The parts of an event this reads. Anything shaped like it will do — the reminder card is. */
export interface MeetingSource {
  readonly description?: string | null;
  readonly location?: string | null;
  readonly conferenceUrl?: string | null;
}

const PROVIDERS: { provider: MeetingProvider; label: string; pattern: RegExp }[] = [
  { provider: "meet", label: "Google Meet", pattern: /^https:\/\/meet\.google\.com\//i },
  { provider: "zoom", label: "Zoom", pattern: /^https:\/\/[\w.-]*zoom\.(us|com)\/(j|w|s|my)\//i },
  { provider: "teams", label: "Teams", pattern: /^https:\/\/teams\.(microsoft|live)\.com\//i },
  { provider: "webex", label: "Webex", pattern: /^https:\/\/[\w.-]*webex\.com\//i },
];

/**
 * Trailing punctuation belongs to the sentence, not the link: a URL has to end on a character
 * that could plausibly be the last one, or "join at https://meet.google.com/abc." is a button
 * that opens a 404.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]*[^\s<>"')\].,;:!?]/g;

/** An address is text; a room name or a link is not. "Grote Markt 1, Antwerpen" is. */
const ADDRESSY = /\d|\bstraat\b|\bstreet\b|\bst\.|\bave\b|\broad\b|\brd\b|\blaan\b|,/i;

export function meetingOf(event: MeetingSource): Meeting {
  const found = [
    ...(event.conferenceUrl ? [event.conferenceUrl] : []),
    ...urlsIn(event.location),
    ...urlsIn(event.description),
  ];

  const join = found.map(asJoin).find((link) => link !== null) ?? null;
  const links: MeetingLink[] = [];
  const seen = new Set(join ? [join.url] : []);
  for (const url of found) {
    if (seen.has(url) || asJoin(url)) continue;
    seen.add(url);
    links.push({ url, label: siteOf(url) });
  }

  return { join, links, location: placeOf(event.location) };
}

/** Whether the event is somewhere, as opposed to being a link or a room booking. */
export function hasAddress(event: MeetingSource) {
  const place = placeOf(event.location);
  return place !== null && ADDRESSY.test(place);
}

function asJoin(url: string) {
  const known = PROVIDERS.find((candidate) => candidate.pattern.test(url));
  if (known) return { url, label: known.label, provider: known.provider };
  return null;
}

/**
 * The location, minus the link some invitations put there instead of an address. An empty
 * location and a location that was only ever a link both mean "nowhere to go".
 */
function placeOf(location: string | null | undefined) {
  if (!location) return null;
  const text = location
    .replace(URL_PATTERN, "")
    .replace(/[\s,;|]+$/, "")
    .trim();
  return text.length > 0 ? text : null;
}

function urlsIn(text: string | null | undefined) {
  return text ? (text.match(URL_PATTERN) ?? []) : [];
}

/** "docs.google.com/…" reads as "Google Docs" to a person; the host is the closest we get. */
function siteOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}
