import { describe, expect, it } from "bun:test";
import { resolveTaskFields, suggestTaskMapping } from "./data-source";

const schema = {
  properties: {
    Name: { id: "t", type: "title" },
    Description: { id: "d", type: "rich_text" },
    Date: { id: "da", type: "date" },
    Priority: { id: "p", type: "select", select: { options: [{ id: "1", name: "High" }] } },
    Assignee: { id: "a", type: "relation" },
    "Parent item": { id: "pi", type: "relation" },
    Status: {
      id: "s",
      type: "status",
      status: {
        options: [
          { id: "b", name: "Backlog" },
          { id: "ip", name: "In Progress" },
          { id: "rt", name: "Ready For Test" },
          { id: "dn", name: "Done" },
          { id: "rj", name: "Rejected" },
        ],
        groups: [
          { name: "To-do", option_ids: ["b"] },
          { name: "In progress", option_ids: ["ip"] },
          { name: "Complete", option_ids: ["rt", "dn", "rj"] },
        ],
      },
    },
  },
};

describe("resolveTaskFields", () => {
  it("finds each property by type and then by name", () => {
    const fields = resolveTaskFields(schema);
    expect(fields.title).toBe("Name");
    expect(fields.status).toBe("Status");
    expect(fields.dates).toBe("Date");
    expect(fields.priority).toBe("Priority");
    expect(fields.assignee).toBe("Assignee");
    expect(fields.parent).toBe("Parent item");
  });

  it("says which group each column belongs to", () => {
    expect(resolveTaskFields(schema).groups).toEqual({
      Backlog: "to_do",
      "In Progress": "in_progress",
      "Ready For Test": "complete",
      Done: "complete",
      Rejected: "complete",
    });
  });

  it("picks the first column that already means each status", () => {
    expect(resolveTaskFields(schema).columns).toEqual({
      todo: "Backlog",
      doing: "In Progress",
      done: "Ready For Test",
      dropped: "Rejected",
    });
  });

  it("copes with a database that has none of them", () => {
    const fields = resolveTaskFields({ properties: { Title: { type: "title" } } });
    expect(fields).toEqual({
      title: "Title",
      status: null,
      dates: null,
      assignee: null,
      parent: null,
      priority: null,
      columns: {},
      groups: {},
    });
  });

  it("takes a chosen column over the one it would have found", () => {
    const chosen = { status: "Status", dates: null, assignee: "Parent item", parent: null };
    const fields = resolveTaskFields(schema, chosen);
    expect(fields.dates).toBeNull();
    expect(fields.assignee).toBe("Parent item");
    expect(fields.parent).toBeNull();
  });

  it("falls back to nothing for a chosen column the board no longer has", () => {
    const chosen = { status: "Stage", dates: "Date", assignee: null, parent: null };
    const fields = resolveTaskFields(schema, chosen);
    expect(fields.status).toBeNull();
    expect(fields.columns).toEqual({});
    expect(fields.dates).toBe("Date");
  });
});

describe("suggestTaskMapping", () => {
  it("reads the board's own sub-items relation as the parent", () => {
    const board = {
      id: "ds",
      properties: {
        Name: { type: "title" },
        Owner: { type: "people" },
        Blocks: { type: "relation", relation: { data_source_id: "other" } },
        Epic: { type: "relation", relation: { data_source_id: "ds" } },
      },
    };
    expect(suggestTaskMapping(board)).toEqual({ status: null, dates: null, assignee: "Owner", parent: "Epic" });
  });
});
