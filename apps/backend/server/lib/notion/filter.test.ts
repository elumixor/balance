import { describe, expect, it } from "bun:test";
import type { NotionPage } from "./client";
import { keepAssigned } from "./filter";

const page = (id: string, people: string[], parent?: string): NotionPage => ({
  id,
  url: "",
  last_edited_time: "",
  properties: {
    Owner: { type: "people", people: people.map((one) => ({ id: one })) },
    Parent: { type: "relation", relation: parent ? [{ id: parent }] : [] },
  },
});

const fields = { assignee: "Owner", parent: "Parent" };

describe("keepAssigned", () => {
  const board = [
    page("epic", ["lead"]),
    page("mine", ["me"], "epic"),
    page("theirs", ["you"], "epic"),
    page("deep", ["me", "you"], "mine"),
    page("loose", []),
  ];

  it("keeps whatever is assigned to anyone chosen, and what it sits under", () => {
    expect(keepAssigned(board, fields, ["me"]).map((one) => one.id)).toEqual(["epic", "mine", "deep"]);
  });

  it("keeps everything when nobody is chosen or nothing says whose a row is", () => {
    expect(keepAssigned(board, fields, [])).toHaveLength(5);
    expect(keepAssigned(board, { assignee: null, parent: "Parent" }, ["me"])).toHaveLength(5);
  });

  it("stops at a parent outside the rows it was given", () => {
    const orphan = [page("child", ["me"], "gone")];
    expect(keepAssigned(orphan, fields, ["me"]).map((one) => one.id)).toEqual(["child"]);
  });

  it("keeps a row without its parent chain when no parent is mapped", () => {
    expect(keepAssigned(board, { assignee: "Owner", parent: null }, ["me"]).map((one) => one.id)).toEqual([
      "mine",
      "deep",
    ]);
  });

  it("survives a cycle of parents", () => {
    const loop = [page("a", ["me"], "b"), page("b", [], "a")];
    expect(keepAssigned(loop, fields, ["me"]).map((one) => one.id)).toEqual(["a", "b"]);
  });

  it("matches names where the assignee is only words", () => {
    const named = (id: string, text: string | null) => ({
      id,
      url: "",
      last_edited_time: "",
      properties: { Who: { type: "formula", formula: { type: "string", string: text } } },
    });
    const rows = [named("a", "Vlad Y., Ana"), named("b", "Ana"), named("c", null)];
    expect(keepAssigned(rows, { assignee: "Who", parent: null }, ["Vlad Y."]).map((one) => one.id)).toEqual(["a"]);
  });
});
