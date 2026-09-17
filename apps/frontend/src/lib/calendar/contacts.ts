/**
 * Who to suggest when a guest list is being typed into.
 *
 * The server hands over everyone the account knows an address for — met on an event, or written
 * in its address book — once a session, and this is what turns that list into the six rows worth
 * showing under the field. Nobody types an address to find a stranger: the person being invited
 * is almost always somebody met recently and often, so what matched matters less than who it is.
 */

export interface KnownPerson {
  readonly email: string;
  readonly name: string | null;
  /** How many recent events they have been on. Zero for somebody only the address book knows. */
  readonly count: number;
  /** The most recent of those events, as an instant, or null when there hasn't been one. */
  readonly lastSeen: string | null;
  /** Whether the account's own contacts have them, which makes their name the better spelling. */
  readonly contact: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Past this, "when did we last meet" stops separating anybody from anybody else. */
const DECAY_DAYS = 120;
/** Ten shared events is as familiar as this needs to tell apart; a hundred is not ten times more. */
const FREQUENT = 10;
/** Six rows is a glance. A dozen is a list to read, which is slower than finishing the address. */
const SHOWN = 6;

/** A match counts for more than any amount of familiarity, so it is scored an order above it. */
const MATCH_WEIGHT = 10;
const STRONG_MATCH = 3;
const WEAK_MATCH = 1;
const RECENCY_WEIGHT = 2;
const CONTACT_BONUS = 0.25;

/**
 * The people worth offering for what has been typed so far, best first. An empty query is the
 * list as it stands — whoever is most familiar — which is what the field shows before a key is
 * pressed. Anyone already on the guest list is left out: they can't be invited twice.
 */
export function suggestPeople(
  people: readonly KnownPerson[],
  query: string,
  invited: readonly string[] = [],
  now: number = Date.now(),
  limit: number = SHOWN,
): KnownPerson[] {
  const needle = query.trim().toLowerCase();
  const already = new Set(invited.map((email) => email.toLowerCase()));

  const scored: { person: KnownPerson; score: number }[] = [];
  for (const person of people) {
    if (already.has(person.email.toLowerCase())) continue;
    const match = matchScore(person, needle);
    if (match === 0) continue;
    scored.push({ person, score: match * MATCH_WEIGHT + familiarity(person, now) });
  }

  // The address is the tiebreak rather than the order the server happened to send: a list that
  // reshuffles between two identical keystrokes is a list nothing can be picked off.
  scored.sort((a, b) => b.score - a.score || a.person.email.localeCompare(b.person.email));
  return scored.slice(0, limit).map((entry) => entry.person);
}

/** How well somebody answers what has been typed: the start of a name or an address, or anywhere. */
function matchScore(person: KnownPerson, needle: string): number {
  if (!needle) return WEAK_MATCH;
  const email = person.email.toLowerCase();
  const name = (person.name ?? "").toLowerCase();
  if (email.startsWith(needle) || startsAWord(name, needle)) return STRONG_MATCH;
  if (email.includes(needle) || name.includes(needle)) return WEAK_MATCH;
  return 0;
}

/** "ann" is the start of "Mary Ann Brown" as much as of "Ann Brown", and neither is a substring hit. */
function startsAWord(name: string, needle: string): boolean {
  return name.split(/[\s.,_-]+/).some((word) => word.startsWith(needle));
}

/** How much this person feels like the one being typed, from how recently and how often you meet. */
function familiarity(person: KnownPerson, now: number): number {
  const days = person.lastSeen === null ? Infinity : (now - Date.parse(person.lastSeen)) / MS_PER_DAY;
  const recency = Math.max(0, Math.min(1, 1 - days / DECAY_DAYS));
  const often = Math.min(person.count, FREQUENT) / FREQUENT;
  return recency * RECENCY_WEIGHT + often + (person.contact ? CONTACT_BONUS : 0);
}
