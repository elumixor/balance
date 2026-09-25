import type { Person } from "./types";

/**
 * Who to offer for what has been typed so far, best first — the rows under every field that
 * names a person: a guest, a member, an assignee. A strong match is the start of a word of the
 * name or of the address; a weak one is anywhere in either; an empty query is everybody, by name.
 * Whoever is already on the list being filled is left out: nobody is invited twice.
 */

/** Six rows is a glance. A dozen is a list to read, which is slower than finishing the name. */
const SHOWN = 6;
const STRONG_MATCH = 2;
const WEAK_MATCH = 1;

export function suggestPeople(
  people: readonly Person[],
  query: string,
  /** Ids or addresses already taken, whichever the caller keeps. */
  taken: readonly string[] = [],
  limit: number = SHOWN,
): Person[] {
  const needle = query.trim().toLowerCase();
  const already = new Set(taken.map((key) => key.toLowerCase()));

  const scored: { person: Person; score: number }[] = [];
  for (const person of people) {
    if (already.has(person.id) || (person.email && already.has(person.email.toLowerCase()))) continue;
    const score = matchScore(person, needle);
    if (score === 0) continue;
    scored.push({ person, score });
  }

  // The name is the tiebreak rather than the order the records happened to arrive in: a list that
  // reshuffles between two identical keystrokes is a list nothing can be picked off.
  scored.sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));
  return scored.slice(0, limit).map((entry) => entry.person);
}

function matchScore(person: Person, needle: string): number {
  if (!needle) return WEAK_MATCH;
  const email = (person.email ?? "").toLowerCase();
  const name = person.name.toLowerCase();
  if (email.startsWith(needle) || startsAWord(name, needle)) return STRONG_MATCH;
  if (email.includes(needle) || name.includes(needle)) return WEAK_MATCH;
  return 0;
}

/** "ann" is the start of "Mary Ann Brown" as much as of "Ann Brown", and neither is a substring hit. */
function startsAWord(name: string, needle: string): boolean {
  return name.split(/[\s.,_-]+/).some((word) => word.startsWith(needle));
}

/** Whether typed text is an address at all — the test every free-typed guest has to pass. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (text: string) => EMAIL_PATTERN.test(text.trim());
