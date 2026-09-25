import { describe, expect, it } from "vitest";
import { isEmail, suggestPeople } from "./suggest";
import type { Person } from "./types";

function person(email: string | null, name = "", id = email ?? name): Person {
  return { id, name: name || (email ?? ""), email, color: "#000", avatar: null };
}

const emails = (people: Person[]) => people.map((p) => p.email);

describe("suggestPeople", () => {
  it("offers everybody by name before a key is pressed", () => {
    const people = [person("c@x.com", "Cara"), person("a@x.com", "Ann"), person("b@x.com", "Bob")];
    expect(emails(suggestPeople(people, ""))).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("matches the start of an address ahead of the middle of one", () => {
    const people = [person("someone@anna.com"), person("anna@x.com")];
    expect(emails(suggestPeople(people, "anna"))).toEqual(["anna@x.com", "someone@anna.com"]);
  });

  it("matches any word of a name, not just the first", () => {
    const people = [person("a@x.com", "Mary Ann Brown"), person("b@x.com", "Joanna Reed")];
    expect(emails(suggestPeople(people, "ann"))).toEqual(["a@x.com", "b@x.com"]);
  });

  it("separates words by dots, commas, underscores and dashes too", () => {
    expect(emails(suggestPeople([person("a@x.com", "Reed-Smith,Ann_Marie")], "marie"))).toEqual(["a@x.com"]);
  });

  it("finds somebody with no address by their name alone", () => {
    expect(suggestPeople([person(null, "Nameless Nat", "p1")], "nat").map((p) => p.id)).toEqual(["p1"]);
  });

  it("drops anybody who matches nothing", () => {
    expect(suggestPeople([person("a@x.com", "Ann")], "zz")).toEqual([]);
  });

  it("leaves out whoever is already taken, by address in any case or by id", () => {
    const people = [person("ann@x.com"), person("bob@x.com"), person(null, "Cy", "cy-id")];
    expect(suggestPeople(people, "", ["ANN@x.com", "cy-id"]).map((p) => p.id)).toEqual(["bob@x.com"]);
  });

  it("stops at the limit", () => {
    const people = Array.from({ length: 10 }, (_, i) => person(`p${i}@x.com`));
    expect(suggestPeople(people, "").length).toBe(6);
    expect(suggestPeople(people, "", [], 3).length).toBe(3);
  });
});

describe("isEmail", () => {
  it("takes an address and refuses a name or a half-typed one", () => {
    expect(isEmail(" ann@x.com ")).toBe(true);
    expect(isEmail("Ann Brown")).toBe(false);
    expect(isEmail("ann@")).toBe(false);
  });
});
