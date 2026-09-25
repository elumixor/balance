import { describe, expect, it } from "vitest";
import { groupItems, rankItems, type SearchItem } from "./items";

const item = (label: string, over: Partial<SearchItem> = {}): SearchItem => ({
  id: label,
  kind: "project",
  label,
  run: () => {},
  ...over,
});
const labels = (items: SearchItem[]) => items.map((i) => i.label);

describe("rankItems", () => {
  it("hands back the first rows in their own order for an empty query", () => {
    const items = [item("b"), item("a"), item("c")];
    expect(labels(rankItems(items, "", 2))).toEqual(["b", "a"]);
  });

  it("puts the start of a word above a match inside one, above a keyword", () => {
    const items = [item("Settings", { keywords: "combat" }), item("Honeycomb care"), item("ATMA / Combat")];
    expect(labels(rankItems(items, "comb"))).toEqual(["ATMA / Combat", "Honeycomb care", "Settings"]);
  });

  it("matches the hint the way it matches the inside of a label", () => {
    const items = [item("Standup", { hint: "Tue 3 Mar" }), item("Review")];
    expect(labels(rankItems(items, "mar"))).toEqual(["Standup"]);
  });

  it("keeps source order between equal ranks and drops what matches nothing", () => {
    const items = [item("Anna"), item("Bob"), item("Annika")];
    expect(labels(rankItems(items, "ann"))).toEqual(["Anna", "Annika"]);
  });

  it("stops at the limit", () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`row ${i}`));
    expect(rankItems(items, "row").length).toBe(14);
  });
});

describe("groupItems", () => {
  it("groups by kind in a fixed order and leaves out empty kinds", () => {
    const items = [item("t", { kind: "task" }), item("s", { kind: "screen" }), item("t2", { kind: "task" })];
    expect(groupItems(items).map((g) => [g.kind, g.items.length])).toEqual([
      ["screen", 1],
      ["task", 2],
    ]);
  });
});
