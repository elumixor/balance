import { describe, expect, it } from "vitest";
import type { Project, Stage, Task } from "$lib/projects/types";
import { dueMarkers } from "./markers";

const categories = [
  { id: "c", name: "Projects", color: "#ff0000", icon: "hexagon", targetHoursPerWeek: 20, isBuffer: false },
];
const project = { id: "p", categoryId: "c", name: "Balance" } as Project;
const stage = (over: Partial<Stage> = {}) =>
  ({ id: "s", projectId: "p", name: "Beta", ordinal: 0, startsOn: null, endsOn: "2026-09-15", ...over }) as Stage;
const task = (over: Partial<Task> = {}) =>
  ({ id: "t", projectId: "p", title: "Ship it", status: "todo", endsOn: "2026-09-16", ...over }) as Task;

/** The strip's first day — the tests read the markers as day offsets from it. */
const stripStart = new Date(2026, 8, 14);

describe("dueMarkers", () => {
  it("puts a stage's end and a task's due day on the strip", () => {
    expect(dueMarkers([stage()], [task()], [project], categories, stripStart, 7)).toEqual([
      { key: "stage:s", projectId: "p", label: "Balance · Beta ends", kind: "stage", color: "#ff0000", dayIndex: 1 },
      { key: "task:t", projectId: "p", label: "Ship it", kind: "task", color: "#ff0000", dayIndex: 2 },
    ]);
  });

  it("says nothing about work that is over, or has no day", () => {
    const finished = [
      task({ id: "a", status: "done" }),
      task({ id: "b", status: "dropped" }),
      task({ id: "c", endsOn: null }),
    ];
    expect(dueMarkers([stage({ endsOn: null })], finished, [project], categories, stripStart, 7)).toEqual([]);
  });

  it("leaves out days off the strip and rows whose project is gone", () => {
    const off = [task({ id: "early", endsOn: "2026-09-01" }), task({ id: "late", endsOn: "2026-10-01" })];
    expect(dueMarkers([], off, [project], categories, stripStart, 7)).toEqual([]);
    expect(dueMarkers([], [task({ projectId: "nobody" })], [project], categories, stripStart, 7)).toEqual([]);
  });

  it("names a task nobody has titled", () => {
    const [marker] = dueMarkers([], [task({ title: "" })], [project], categories, stripStart, 7);
    expect(marker?.label).toBe("Untitled task");
  });

  it("falls back to the rest colour and an untitled name", () => {
    const orphan = { ...project, categoryId: "gone", name: "" };
    const [marker] = dueMarkers([stage()], [], [orphan], categories, stripStart, 7);
    expect(marker?.color).not.toBe("#ff0000");
    expect(marker?.label).toBe("Untitled project · Beta ends");
  });

  it("draws a stage before a task on the same day", () => {
    const markers = dueMarkers([stage({ endsOn: "2026-09-16" })], [task()], [project], categories, stripStart, 7);
    expect(markers.map((one) => one.kind)).toEqual(["stage", "task"]);
  });
});
