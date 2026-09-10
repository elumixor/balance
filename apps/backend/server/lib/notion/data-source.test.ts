import { describe, expect, it } from "bun:test";
import { resolveTaskFields } from "./data-source";

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
    expect(fields.date).toBe("Date");
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
      date: null,
      priority: null,
      assignee: null,
      parent: null,
      columns: {},
      groups: {},
    });
  });
});
