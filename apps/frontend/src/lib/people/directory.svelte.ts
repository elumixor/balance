import { people, synced } from "$lib/core/synced.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { shrinkAvatar } from "./avatar";
import { lookupPerson, seedPeople } from "./queries";
import { isEmail } from "./suggest";
import type { Person } from "./types";

/** The colour a person made here wears until a face arrives. */
const DEFAULT_COLOR = "#8b8b8b";

/**
 * The people the account knows, and the one way anyone joins the list.
 *
 * Every field that names a person — a guest, today — reads `all` and writes through `ensure`, so
 * an address typed into one invitation lands in the same row and are offered back everywhere else. The rows are synced records; this is the
 * lookup around them, and the seeding pass that fills the list from recent events before anybody
 * has typed a thing.
 */
class PeopleDirectory {
  #seeded = false;

  get all(): readonly Person[] {
    return people.all;
  }

  byId(id: string): Person | null {
    return people.all.find((person) => person.id === id) ?? null;
  }

  byEmail(email: string): Person | null {
    const needle = email.trim().toLowerCase();
    return people.all.find((person) => person.email?.toLowerCase() === needle) ?? null;
  }

  /**
   * Once a session, after the records are in: everybody met on a recent event gets a row. Its
   * failure is a card in the corner and an emptier list, never a screen that can't open.
   */
  async seed() {
    if (this.#seeded) return;
    this.#seeded = true;
    try {
      const added = await seedPeople();
      if (added > 0) await synced.sync();
    } catch (error) {
      this.#seeded = false;
      diagnostics.report("People", error, { title: "Couldn't read who you've been meeting", retry: () => this.seed() });
    }
  }

  /**
   * The person for what was typed — the existing row for a known address, or a new one. An
   * address is looked up for its name and face in the background, so the row is there to pick
   * the instant Enter is pressed and fills itself in a moment later; a bare name is just a name.
   */
  ensure(typed: string): Person {
    const text = typed.trim();
    const email = isEmail(text) ? text : null;
    const known = email ? this.byEmail(email) : this.byName(text);
    if (known) return known;

    const created = people.create({
      name: email ? (email.split("@")[0] ?? email) : text,
      email,
      color: DEFAULT_COLOR,
      avatar: null,
    });
    if (email) void this.lookup(created.id);
    return created;
  }

  /**
   * Asks Google's address book and Gravatar about a row's address, and writes back what they
   * knew. Run by itself after an address is typed, it fills only what is still a guess — a name
   * somebody wrote here is theirs to keep; pressed on purpose, it replaces the name and the face.
   */
  async lookup(id: string, replace = false) {
    const person = this.byId(id);
    if (!person?.email) return;
    try {
      const found = await lookupPerson(person.email);
      const patch: Partial<Person> = {};
      const guessed = person.name === person.email.split("@")[0] || !person.name.trim();
      if (replace || guessed) patch.name = found.name;
      if (found.avatar && (replace || !person.avatar)) patch.avatar = found.avatar;
      if (Object.keys(patch).length > 0) people.update(id, patch);
    } catch (error) {
      diagnostics.report("People", error, { title: `Couldn't look up ${person.email}` });
    }
  }

  update(id: string, patch: Partial<Omit<Person, "id">>) {
    people.update(id, patch);
  }

  async setAvatar(id: string, file: File) {
    try {
      people.update(id, { avatar: await shrinkAvatar(file) });
    } catch (error) {
      diagnostics.report("People", error, { title: "Couldn't use that picture" });
    }
  }

  remove(id: string) {
    people.delete(id);
  }

  byName(name: string): Person | null {
    const needle = name.toLowerCase();
    return people.all.find((person) => person.name.toLowerCase() === needle) ?? null;
  }
}

export const peopleDirectory = new PeopleDirectory();
