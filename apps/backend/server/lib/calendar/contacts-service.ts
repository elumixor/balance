import { TtlCache } from "~/lib/ttl-cache";
import { calendarConnections } from "./registry";
import type { ExternalPerson } from "./types";
import { visibleCalendarIds } from "./write-target";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Far enough back to hold the people somebody actually works with, near enough to stay current. */
const LOOK_BACK_DAYS = 120;
/** Whoever is already in the diary is the likeliest person to be typed next. */
const LOOK_AHEAD_DAYS = 30;

/**
 * A directory is worth one Google pass per ten minutes, not one per keystroke: the device fetches
 * the whole thing once a session and filters it as somebody types. Holding the promise is what
 * makes two screens asking at once share a single pass.
 */
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new TtlCache<Promise<KnownPerson[]>>(TTL_MS, MAX_ENTRIES);

/** A calendar address that is a room, a group or Google's own plumbing rather than a person. */
const NOT_A_PERSON = /(\.calendar\.google\.com|\.calendar\.resource\.calendar\.google\.com|@resource\.calendar)$/i;

export interface KnownPerson {
  readonly email: string;
  readonly name: string | null;
  /** How many events they have been on — the difference between a colleague and a one-off. */
  readonly count: number;
  /** The most recent of those events, or null for somebody only the address book knows. */
  readonly lastSeen: Date | null;
  /** Whether the address book has them, which is what makes a name worth trusting over a guest line. */
  readonly contact: boolean;
}

/**
 * Everyone this account already knows an address for, so a guest list can be picked rather than
 * typed. Two sources, and both are needed: the guest lists of recent events, which work on any
 * grant this app has ever made, and the account's own contacts — the written-down ones and the
 * ones Google keeps from sent mail — which need a scope a grant only has if it was made since.
 *
 * Never throws. A directory is a convenience, and a convenience that can break the card it sits
 * in is worse than no directory at all: a dead account, a refused scope and a rate limit all come
 * back as fewer suggestions.
 */
export class CalendarContactsService {
  constructor(private readonly userId: string) {}

  list(): Promise<KnownPerson[]> {
    const hit = cache.get(this.userId);
    if (hit) return hit;

    const people = this.#load().catch(() => {
      cache.delete(this.userId);
      return [] as KnownPerson[];
    });
    cache.set(this.userId, people);
    return people;
  }

  async #load(): Promise<KnownPerson[]> {
    const connections = await calendarConnections(this.userId);
    const active = connections.filter((c) => !c.account.revokedAt);
    if (active.length === 0) return [];

    const now = Date.now();
    const from = new Date(now - LOOK_BACK_DAYS * MS_PER_DAY);
    const to = new Date(now + LOOK_AHEAD_DAYS * MS_PER_DAY);

    const own = new Set(active.flatMap((c) => (c.account.email ? [c.account.email.toLowerCase()] : [])));
    const perAccount = await Promise.all(
      active.map(async (connection) => {
        const [met, contacts] = await Promise.all([
          connection.provider.listPeople(visibleCalendarIds(connection), from, to).catch(() => []),
          connection.provider.listContacts().catch(() => []),
        ]);
        return { met, contacts };
      }),
    );

    const known = new Map<string, Mutable>();
    for (const { met, contacts } of perAccount) {
      for (const person of met) record(known, own, person, false);
      for (const person of contacts) record(known, own, person, true);
    }
    return [...known.values()];
  }
}

type Mutable = { -readonly [K in keyof KnownPerson]: KnownPerson[K] };

function record(known: Map<string, Mutable>, own: Set<string>, person: ExternalPerson, contact: boolean): void {
  const email = person.email.trim().toLowerCase();
  if (!email.includes("@") || own.has(email) || NOT_A_PERSON.test(email)) return;

  const existing = known.get(email);
  if (!existing) {
    known.set(email, {
      email: person.email.trim(),
      name: person.name?.trim() || null,
      count: contact ? 0 : 1,
      lastSeen: person.lastSeen,
      contact,
    });
    return;
  }
  if (!contact) existing.count += 1;
  // An address book entry is somebody's own spelling of the name; a guest line is whatever their
  // calendar sends. The book wins, and between two guest lines the first name seen stands.
  if (person.name?.trim() && (contact || !existing.name)) existing.name = person.name.trim();
  existing.contact ||= contact;
  if (person.lastSeen && (!existing.lastSeen || person.lastSeen > existing.lastSeen)) {
    existing.lastSeen = person.lastSeen;
  }
}
