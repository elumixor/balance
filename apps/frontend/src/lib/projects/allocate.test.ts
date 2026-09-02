import { describe, expect, it } from "vitest";
import { allocate, overclaim } from "./allocate";

describe("allocate", () => {
  it("keeps every claim under the cap", () => {
    expect(
      allocate(24, [
        { id: "a", claimed: 8 },
        { id: "b", claimed: 4 },
      ]),
    ).toEqual([
      { id: "a", claimed: 8, hours: 8 },
      { id: "b", claimed: 4, hours: 4 },
    ]);
  });

  it("gives the top of the order its whole claim and the tail what is left", () => {
    const fit = allocate(12, [
      { id: "a", claimed: 8 },
      { id: "b", claimed: 8 },
      { id: "c", claimed: 2 },
    ]);
    expect(fit.map((f) => f.hours)).toEqual([8, 4, 0]);
  });

  it("rounds to a quarter hour and never goes negative", () => {
    expect(allocate(1.1, [{ id: "a", claimed: 5 }])[0].hours).toBe(1);
    expect(allocate(-3, [{ id: "a", claimed: 5 }])[0].hours).toBe(0);
  });
});

describe("overclaim", () => {
  it("says by how much a sphere is oversubscribed, and zero when it isn't", () => {
    expect(
      overclaim(10, [
        { id: "a", claimed: 8 },
        { id: "b", claimed: 6 },
      ]),
    ).toEqual({ total: 14, cap: 10, over: 4 });
    expect(overclaim(10, [{ id: "a", claimed: 3 }]).over).toBe(0);
  });
});
