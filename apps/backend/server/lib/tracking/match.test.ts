import { describe, expect, test } from "bun:test";
import { rankMatches } from "./match";

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 3, 9, minutes));
const window = { start: at(0), end: at(60), categoryId: "work" };
const event = (id: string, from: number, to: number, categoryId: string | null = null) => ({
  id,
  start: at(from),
  end: at(to),
  categoryId,
});

describe("rankMatches", () => {
  test("nothing overlapping, nothing near: no candidates", () => {
    expect(rankMatches(window, [event("later", 120, 180), event("earlier", -120, -60)])).toEqual([]);
  });

  test("the block the timer ran inside wins outright; one it only brushed is noise", () => {
    const ranked = rankMatches(window, [event("brushed", 55, 120), event("inside", 0, 60)]);
    expect(ranked.map((m) => m.event.id)).toEqual(["inside"]);
    expect(ranked[0].score).toBeCloseTo(1, 5);
  });

  test("a block the timer ran half of is offered behind one it ran all of", () => {
    const ranked = rankMatches(window, [event("half", 30, 90), event("whole", 0, 60)]);
    expect(ranked.map((m) => m.event.id)).toEqual(["whole", "half"]);
  });

  test("a coinciding event in the same category beats one in another", () => {
    const ranked = rankMatches(window, [event("other", 0, 60, "rest"), event("same", 0, 60, "work")]);
    expect(ranked[0].event.id).toBe("same");
    expect(ranked[1].score).toBeLessThan(ranked[0].score);
  });

  test("an event counting as nothing edges out one already claimed elsewhere", () => {
    const ranked = rankMatches(window, [event("claimed", 0, 60, "rest"), event("grey", 0, 60)]);
    expect(ranked[0].event.id).toBe("grey");
  });

  test("an event starting a few minutes before, with no overlap, is still offered", () => {
    const ranked = rankMatches({ ...window, start: at(20), end: at(80) }, [event("early", 0, 20)]);
    expect(ranked).toHaveLength(1);
  });

  test("an event starting more than half an hour away with no overlap is not", () => {
    expect(rankMatches({ ...window, start: at(40), end: at(100) }, [event("early", 0, 5)])).toEqual([]);
  });

  test("a short timer inside a long block is a weak match, not a certain one", () => {
    const [match] = rankMatches({ ...window, end: at(2) }, [event("long", 0, 120, "rest")]);
    expect(match.score).toBeLessThan(0.5);
  });

  test("zero-length spans score nothing", () => {
    expect(rankMatches({ ...window, end: at(0) }, [event("e", 0, 60)])).toEqual([]);
    expect(rankMatches(window, [event("e", 0, 0)])).toEqual([]);
  });
});
