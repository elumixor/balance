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
  ({
    id: "t",
    projectId: "p",
    title: "Ship it",
    status: "todo",
    startsOn: null,
    endsOn: "2026-09-16",
    ...over,
  }) as Task;

/** The strip's first day — the tests read the markers as day offsets from it. */
const stripStart = new Date(2026, 8, 14);

describe("dueMarkers", () => {
  it("puts a stage's end and a task's due day on the strip", () => {
    expect(dueMarkers([stage()], [task()], [project], categories, stripStart, 7)).toEqual([
      {
        key: "stage:s",
        projectId: "p",
        label: "Balance · Beta ends",
        kind: "stage",
        color: "#ff0000",
        dayIndex: 1,
        days: 1,
        row: 0,
      },
      { key: "task:t", projectId: "p", label: "Ship it", kind: "task", color: "#ff0000", dayIndex: 2, days: 1, row: 0 },
    ]);
  });

  it("says nothing about work that is over, or has no day", () => {
    const finished = [
      task({ id: "a", status: "done" }),
      task({ id: "b", status: "dropped" }),
      task({ id: "c", startsOn: null, endsOn: null }),
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

  it("runs a task across every day from its start to its end", () => {
    const [marker] = dueMarkers(
      [],
      [task({ startsOn: "2026-09-15", endsOn: "2026-09-18" })],
      [project],
      categories,
      stripStart,
      7,
    );
    expect(marker).toMatchObject({ dayIndex: 1, days: 4, row: 0 });
  });

  it("reads a task with only a start as that one day, and a backwards range the right way round", () => {
    const only = dueMarkers([], [task({ startsOn: "2026-09-17", endsOn: null })], [project], categories, stripStart, 7);
    expect(only[0]).toMatchObject({ dayIndex: 3, days: 1 });
    const backwards = dueMarkers(
      [],
      [task({ startsOn: "2026-09-18", endsOn: "2026-09-15" })],
      [project],
      categories,
      stripStart,
      7,
    );
    expect(backwards[0]).toMatchObject({ dayIndex: 1, days: 4 });
  });

  it("clips a task that runs past either edge of the strip, and keeps one that only crosses it", () => {
    const across = task({ startsOn: "2026-09-01", endsOn: "2026-10-01" });
    expect(dueMarkers([], [across], [project], categories, stripStart, 7)[0]).toMatchObject({ dayIndex: 0, days: 7 });
  });

  it("gives overlapping work rows of its own and lets work that doesn't share a row", () => {
    const tasks = [
      task({ id: "a", startsOn: "2026-09-14", endsOn: "2026-09-16" }),
      task({ id: "b", startsOn: "2026-09-15", endsOn: "2026-09-15" }),
      task({ id: "c", startsOn: "2026-09-17", endsOn: "2026-09-17" }),
      task({ id: "d", startsOn: "2026-09-15", endsOn: "2026-09-18" }),
    ];
    const rows = Object.fromEntries(
      dueMarkers([stage({ endsOn: "2026-09-15" })], tasks, [project], categories, stripStart, 7).map((m) => [
        m.key,
        m.row,
      ]),
    );
    expect(rows).toEqual({ "task:a": 0, "stage:s": 1, "task:d": 2, "task:b": 3, "task:c": 0 });
  });
});
