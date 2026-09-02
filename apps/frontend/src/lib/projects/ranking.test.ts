import { describe, expect, it } from "vitest";
import { type Comparison, nextQuestion, pattern, rankOrder } from "./ranking";

const ids = ["a", "b", "c"];
const won = (
  aId: string,
  bId: string,
  winnerId: string,
  dimension: Comparison["dimension"] = "priority",
): Comparison => ({
  aId,
  bId,
  winnerId,
  dimension,
});

describe("nextQuestion", () => {
  it("asks the first undecided pair, and nothing once every pair is implied", () => {
    expect(nextQuestion(ids, [], "priority")).toEqual({ aId: "a", bId: "b", dimension: "priority" });
    // a > b and b > c implies a > c, so only two questions were ever needed for three projects.
    const answers = [won("a", "b", "a"), won("b", "c", "b")];
    expect(nextQuestion(ids, answers, "priority")).toBeNull();
  });

  it("keeps the dimensions apart", () => {
    const answers = [won("a", "b", "a"), won("b", "c", "b")];
    expect(nextQuestion(ids, answers, "fun")).toEqual({ aId: "a", bId: "b", dimension: "fun" });
  });

  it("does not loop on a contradictory chain", () => {
    const answers = [won("a", "b", "a"), won("b", "c", "b"), won("a", "c", "c")];
    expect(nextQuestion(ids, answers, "priority")).toBeNull();
    // A cycle among three and a fourth nobody has compared: the walk round the cycle ends.
    expect(nextQuestion([...ids, "d"], answers, "priority")).toEqual({ aId: "a", bId: "d", dimension: "priority" });
  });
});

describe("rankOrder", () => {
  it("orders by transitive wins, leaving undecided ties as given", () => {
    expect(rankOrder(ids, [won("b", "c", "c")], "priority")).toEqual(["c", "a", "b"]);
    expect(rankOrder(ids, [], "priority")).toEqual(ids);
    expect(rankOrder(ids, [won("a", "b", "b"), won("b", "c", "c")], "priority")).toEqual(["c", "b", "a"]);
  });
});

describe("pattern", () => {
  it("says nothing until both dimensions have an answer", () => {
    expect(pattern(ids, [])).toBeNull();
    expect(pattern(ids, [won("a", "b", "a")])).toBeNull();
    expect(pattern(["a"], [])).toBeNull();
  });

  it("reports agreement, reversal, and the count in between as an observation", () => {
    const priority = [won("a", "b", "a"), won("b", "c", "b")];
    expect(pattern(ids, [...priority, won("a", "b", "a", "fun"), won("b", "c", "b", "fun")])).toMatch(/line up/);
    expect(pattern(ids, [...priority, won("a", "b", "b", "fun"), won("b", "c", "c", "fun")])).toMatch(/reverse/);
    expect(
      pattern(ids, [...priority, won("a", "b", "b", "fun"), won("a", "c", "a", "fun"), won("b", "c", "b", "fun")]),
    ).toBe("In 1 of 3 pairs, the one you'd rather do is not the one that matters more.");
  });

  it("skips pairs one of the orders cannot tell apart", () => {
    // Fun only knows about a and b; the pairs involving c say nothing either way.
    expect(pattern(ids, [won("a", "b", "a"), won("b", "c", "b"), won("a", "b", "a", "fun")])).toMatch(/line up/);
  });
});
