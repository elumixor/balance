import { describe, expect, it } from "bun:test";
import { dateOf, plainText, priorityOf, relationIds, taskStatus } from "./map";

describe("plainText", () => {
  it("joins the runs of a title", () => {
    expect(plainText({ type: "title", title: [{ plain_text: "Hypo" }, { plain_text: "crisy" }] })).toBe("Hypocrisy");
  });

  it("is empty for a property that isn't there", () => {
    expect(plainText(undefined)).toBe("");
  });
});

describe("dateOf", () => {
  it("ends a single date the day it starts", () => {
    expect(dateOf({ type: "date", date: { start: "2026-09-10" } })).toEqual({
      startsOn: "2026-09-10",
      endsOn: "2026-09-10",
    });
  });

  it("drops the time of day from a range", () => {
    expect(
      dateOf({ type: "date", date: { start: "2026-09-10T09:00:00+02:00", end: "2026-09-12T18:00:00+02:00" } }),
    ).toEqual({ startsOn: "2026-09-10", endsOn: "2026-09-12" });
  });

  it("is empty for an empty date", () => {
    expect(dateOf({ type: "date", date: null })).toEqual({ startsOn: null, endsOn: null });
  });
});

describe("relationIds", () => {
  it("reads a relation and a people property the same way", () => {
    expect(relationIds({ type: "relation", relation: [{ id: "a" }, { id: "b" }] })).toEqual(["a", "b"]);
    expect(relationIds({ type: "people", people: [{ id: "c" }] })).toEqual(["c"]);
    expect(relationIds({ type: "number", number: 3 })).toEqual([]);
  });
});

describe("taskStatus", () => {
  it("takes its meaning from the group", () => {
    expect(taskStatus("Ready For Test", "complete")).toBe("done");
    expect(taskStatus("In Review", "in_progress")).toBe("doing");
    expect(taskStatus("Backlog", "to_do")).toBe("todo");
  });

  it("reads a refusal as dropped whatever group it is in", () => {
    expect(taskStatus("Rejected", "complete")).toBe("dropped");
  });

  it("falls back to the column's own name when it belongs to no group", () => {
    expect(taskStatus("Shipped", null)).toBe("done");
    expect(taskStatus("Doing", null)).toBe("doing");
    expect(taskStatus("Someday", null)).toBe("todo");
    expect(taskStatus("Blocked", null)).toBe("blocked");
  });
});

describe("priorityOf", () => {
  it("maps the words a board uses onto the four the app has", () => {
    expect(priorityOf("Urgent")).toBe("critical");
    expect(priorityOf("normal")).toBe("medium");
    expect(priorityOf("")).toBeNull();
  });
});
