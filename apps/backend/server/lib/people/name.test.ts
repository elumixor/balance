import { describe, expect, it } from "bun:test";
import { nameFromEmail } from "./name";

describe("nameFromEmail", () => {
  it("reads first and last name off a dotted address", () => {
    expect(nameFromEmail("john.doe@example.com")).toBe("John Doe");
  });
  it("splits on underscores, dashes and pluses too", () => {
    expect(nameFromEmail("mary_ann-brown+work@x.io")).toBe("Mary Ann Brown Work");
  });
  it("keeps a single word as one capitalised word", () => {
    expect(nameFromEmail("jdoe42@x.io")).toBe("Jdoe42");
  });
  it("falls back to the address itself when there is nothing before the @", () => {
    expect(nameFromEmail("@x.io")).toBe("@x.io");
  });
});
