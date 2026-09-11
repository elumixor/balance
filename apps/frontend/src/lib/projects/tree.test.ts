import { describe, expect, it } from "vitest";
import { descendantsOf, pathTo, rowsOf, treeOf } from "./tree";

const node = (id: string, parentId: string | null = null, ordinal = 0) => ({ id, parentId, ordinal });

const items = [
  node("atma", null, 0),
  node("hypocrisy", "atma", 0),
  node("combat", "hypocrisy", 1),
  node("art", "hypocrisy", 0),
  node("balance", null, 1),
];

describe("treeOf", () => {
  it("nests each row under its parent, in each level's own order", () => {
    const tree = treeOf(items);
    expect(tree.map((n) => n.item.id)).toEqual(["atma", "balance"]);
    expect(tree[0]?.children[0]?.item.id).toBe("hypocrisy");
    expect(tree[0]?.children[0]?.children.map((n) => n.item.id)).toEqual(["art", "combat"]);
    expect(tree[0]?.children[0]?.children[0]?.depth).toBe(2);
  });

  it("treats a row whose parent isn't here as a root", () => {
    expect(treeOf([node("combat", "hypocrisy")]).map((n) => n.item.id)).toEqual(["combat"]);
  });

  it("breaks a cycle rather than recursing into it", () => {
    const cyclic = [node("a", "b"), node("b", "a")];
    expect(
      treeOf(cyclic)
        .map((n) => n.item.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});

describe("rowsOf", () => {
  it("reads the tree top to bottom with each row's depth", () => {
    expect(rowsOf(treeOf(items)).map((row) => `${row.depth}:${row.item.id}`)).toEqual([
      "0:atma",
      "1:hypocrisy",
      "2:art",
      "2:combat",
      "0:balance",
    ]);
  });

  it("keeps a folded row and drops what is under it", () => {
    expect(rowsOf(treeOf(items), new Set(["hypocrisy"])).map((row) => row.item.id)).toEqual([
      "atma",
      "hypocrisy",
      "balance",
    ]);
  });
});

describe("pathTo", () => {
  it("walks from the root down to the row", () => {
    expect(pathTo(items, "combat").map((one) => one.id)).toEqual(["atma", "hypocrisy", "combat"]);
  });

  it("is empty for a row that isn't there", () => {
    expect(pathTo(items, "nobody")).toEqual([]);
  });

  it("stops rather than looping when a row is its own ancestor", () => {
    expect(pathTo([node("a", "b"), node("b", "a")], "a").map((one) => one.id)).toEqual(["b", "a"]);
  });
});

describe("descendantsOf", () => {
  it("takes everything underneath, at any depth", () => {
    expect(descendantsOf(items, "atma").map((one) => one.id)).toEqual(["hypocrisy", "art", "combat"]);
  });

  it("is empty for a leaf", () => {
    expect(descendantsOf(items, "combat")).toEqual([]);
  });

  it("ignores a row that is its own parent", () => {
    expect(descendantsOf([node("a", "a")], "a")).toEqual([]);
  });
});
