import { eq } from "drizzle-orm";
import { db } from "~/db";
import { people } from "~/db/schema";
import { CalendarContactsService, type KnownPerson } from "~/lib/calendar/contacts-service";
import { colorFor } from "./color";
import { gravatarFor } from "./gravatar";
import { nameFromEmail } from "./name";

/** How many faces one seeding pass is worth asking Gravatar about: a HEAD each, in parallel. */
const GRAVATAR_LOOKUPS = 40;

/** What an address can be turned into without anybody typing: a name and, sometimes, a face. */
export interface PersonLookup {
  readonly name: string;
  readonly avatar: string | null;
}

/**
 * The account's own list of people, and where it comes from before anybody has typed a name.
 *
 * The guest lists of recent events already say who this person meets, so the first thing the list
 * does is read them: everybody met on an event in the last four months becomes a row, named the
 * way the address book spells them, the way their calendar sends them, or off the address itself.
 * Only people actually met are seeded — the address book's thousand "other contacts" would bury
 * the twenty who matter — but the book is still what a name and a picture are looked up in.
 */
export class PeopleService {
  readonly #contacts: CalendarContactsService;

  constructor(private readonly userId: string) {
    this.#contacts = new CalendarContactsService(userId);
  }

  /** Adds a row for everyone met on a recent event who isn't on the list yet. Idempotent. */
  async seed(): Promise<{ added: number }> {
    const known = await this.#contacts.list();
    const met = known.filter((person) => person.count > 0);
    if (met.length === 0) return { added: 0 };

    const existing = await db.query.people.findMany({
      where: eq(people.userId, this.userId),
      columns: { email: true },
    });
    const taken = new Set(existing.flatMap((row) => (row.email ? [row.email.toLowerCase()] : [])));
    const missing = met.filter((person) => !taken.has(person.email.toLowerCase()));
    if (missing.length === 0) return { added: 0 };

    const faces = await this.#faces(missing);
    await db.insert(people).values(
      missing.map((person) => ({
        userId: this.userId,
        name: person.name ?? nameFromEmail(person.email),
        email: person.email,
        color: colorFor(person.email.toLowerCase()),
        avatar: faces.get(person.email) ?? null,
      })),
    );
    return { added: missing.length };
  }

  /** A name and a face for one address: the address book's, then Gravatar's, then the address. */
  async lookup(email: string): Promise<PersonLookup> {
    const known = await this.#contacts.list();
    const match = known.find((person) => person.email.toLowerCase() === email.toLowerCase());
    const avatar = match?.photo ?? (await gravatarFor(email));
    return { name: match?.name ?? nameFromEmail(email), avatar };
  }

  /** The address book's pictures where it has them, and Gravatar's for the first few without. */
  async #faces(missing: readonly KnownPerson[]): Promise<Map<string, string>> {
    const faces = new Map<string, string>();
    const unpictured: KnownPerson[] = [];
    for (const person of missing) {
      if (person.photo) faces.set(person.email, person.photo);
      else unpictured.push(person);
    }
    const looked = await Promise.all(
      unpictured
        .slice(0, GRAVATAR_LOOKUPS)
        .map(async (person) => [person.email, await gravatarFor(person.email)] as const),
    );
    for (const [email, url] of looked) if (url) faces.set(email, url);
    return faces;
  }
}
