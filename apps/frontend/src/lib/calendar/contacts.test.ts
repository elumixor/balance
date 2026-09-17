import { describe, expect, it } from "vitest";
import { type KnownPerson, suggestPeople } from "./contacts";

const NOW = Date.parse("2026-09-17T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function person(email: string, over: Partial<KnownPerson> = {}): KnownPerson {
  return { email, name: null, count: 1, lastSeen: null, contact: false, ...over };
}

/** How long ago, as the server writes it. */
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

const emails = (people: KnownPerson[]) => people.map((p) => p.email);

describe("suggestPeople", () => {
  it("offers the most familiar people before a key is pressed", () => {
    const people = [
      person("stranger@x.com", { count: 0, lastSeen: null }),
      person("daily@x.com", { count: 9, lastSeen: daysAgo(1) }),
      person("once@x.com", { count: 1, lastSeen: daysAgo(90) }),
    ];
    expect(emails(suggestPeople(people, "", [], NOW))).toEqual(["daily@x.com", "once@x.com", "stranger@x.com"]);
  });

  it("matches the start of an address ahead of the middle of one", () => {
    const people = [person("someone@anna.com"), person("anna@x.com")];
    expect(emails(suggestPeople(people, "anna", [], NOW))).toEqual(["anna@x.com", "someone@anna.com"]);
  });

  it("matches any word of a name, not just the first", () => {
    const people = [person("a@x.com", { name: "Mary Ann Brown" }), person("b@x.com", { name: "Joanna Reed" })];
    expect(emails(suggestPeople(people, "ann", [], NOW))).toEqual(["a@x.com", "b@x.com"]);
  });

  it("separates words by dots, commas, underscores and dashes too", () => {
    const people = [person("a@x.com", { name: "Reed-Smith,Ann_Marie" })];
    expect(emails(suggestPeople(people, "marie", [], NOW))).toEqual(["a@x.com"]);
  });

  it("drops anybody who matches nothing", () => {
    expect(suggestPeople([person("a@x.com", { name: "Ann" })], "zz", [], NOW)).toEqual([]);
  });

  it("leaves out whoever is already invited, whatever case they were typed in", () => {
    const people = [person("ann@x.com"), person("bob@x.com")];
    expect(emails(suggestPeople(people, "", ["ANN@x.com"], NOW))).toEqual(["bob@x.com"]);
  });

  it("prefers the person seen more recently when both match the same way", () => {
    const people = [person("a@team.com", { lastSeen: daysAgo(100) }), person("b@team.com", { lastSeen: daysAgo(2) })];
    expect(emails(suggestPeople(people, "team", [], NOW))).toEqual(["b@team.com", "a@team.com"]);
  });

  it("treats an upcoming meeting as freshly as one this morning", () => {
    const soon = new Date(NOW + 3 * DAY).toISOString();
    const people = [person("a@team.com", { lastSeen: daysAgo(0) }), person("b@team.com", { lastSeen: soon })];
    expect(emails(suggestPeople(people, "team", [], NOW))).toEqual(["a@team.com", "b@team.com"]);
  });

  it("counts many shared events over few, and an address-book entry over neither", () => {
    const people = [
      person("few@x.com", { count: 2, lastSeen: null }),
      person("many@x.com", { count: 40, lastSeen: null }),
      person("book@x.com", { count: 2, lastSeen: null, contact: true }),
    ];
    expect(emails(suggestPeople(people, "", [], NOW))).toEqual(["many@x.com", "book@x.com", "few@x.com"]);
  });

  it("orders two equally familiar people by address, so the list never reshuffles", () => {
    const people = [
      person("b@x.com", { count: 3, lastSeen: daysAgo(5) }),
      person("a@x.com", { count: 3, lastSeen: daysAgo(5) }),
    ];
    expect(emails(suggestPeople(people, "", [], NOW))).toEqual(["a@x.com", "b@x.com"]);
  });

  it("ignores the case of what was typed", () => {
    expect(emails(suggestPeople([person("ann@x.com", { name: "Ann" })], "  ANN ", [], NOW))).toEqual(["ann@x.com"]);
  });

  it("shows no more than the limit", () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`p${i}@x.com`));
    expect(suggestPeople(people, "", [], NOW)).toHaveLength(6);
    expect(suggestPeople(people, "", [], NOW, 2)).toHaveLength(2);
  });
});
