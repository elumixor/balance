import { describe, expect, it } from "vitest";
import type { Category } from "$lib/core/records";
import type { Project, Stage } from "$lib/projects/types";
import { decisionMarkers } from "./markers";

const stripStart = new Date(2026, 8, 7); // Mon 7 Sep 2026
const categories: Category[] = [
  { id: "c", name: "Work", color: "#123456", icon: "circle", targetHoursPerWeek: 10, isBuffer: false },
];
const project: Project = {
  id: "p",
  goalId: null,
  categoryId: "c",
  name: "Balance",
  description: "",
  template: "simple",
  hoursPerWeek: 4,
  status: "active",
  cover: null,
  links: [],
  people: [],
  deadline: null,
  unparkTrigger: null,
};
function stage(partial: Partial<Stage>): Stage {
  return {
    id: "s",
    projectId: "p",
    ordinal: 0,
    name: "Do it",
    sentence: "",
    metric: "days",
    threshold: 1,
    windowDays: 7,
    budgetHours: 0,
    startedOn: "2026-09-01",
    decideOn: "2026-09-29",
    extendedOn: null,
    extensionNote: null,
    outcome: null,
    decidedOn: null,
    decisionNote: null,
    checkpoints: [],
    ...partial,
  };
}

describe("decisionMarkers", () => {
  it("puts the decision day and the checkpoints before it on the strip, in the sphere's colour", () => {
    const markers = decisionMarkers([stage({})], [project], categories, stripStart, 28);
    expect(markers).toEqual([
      { key: "s:2026-09-15", projectId: "p", label: "Balance", kind: "checkpoint", color: "#123456", dayIndex: 8 },
      {
        key: "s:2026-09-29",
        projectId: "p",
        label: "Decide: Balance",
        kind: "decision",
        color: "#123456",
        dayIndex: 22,
      },
    ]);
    // A strip three weeks long ends before the decision day.
    expect(decisionMarkers([stage({})], [project], categories, stripStart, 21).map((m) => m.kind)).toEqual([
      "checkpoint",
    ]);
  });

  it("drops days off the strip, stages not running, and projects that are gone", () => {
    const stages = [
      stage({ id: "past", decideOn: "2026-09-06", startedOn: "2026-08-20" }),
      stage({ id: "done", outcome: "ship" }),
      stage({ id: "waiting", startedOn: null, decideOn: null }),
      stage({ id: "orphan", projectId: "nobody" }),
    ];
    expect(decisionMarkers(stages, [project], categories, stripStart, 21)).toEqual([]);
  });

  it("orders a decision before a checkpoint on the same day, and names an unnamed project", () => {
    const stages = [
      stage({ id: "a", startedOn: "2026-09-01", decideOn: "2026-09-15" }),
      stage({ id: "b", startedOn: "2026-08-18", decideOn: "2026-09-29", projectId: "q" }),
    ];
    const projects = [project, { ...project, id: "q", name: "", categoryId: "none" }];
    const markers = decisionMarkers(stages, projects, categories, stripStart, 21);
    expect(markers.map((m) => [m.dayIndex, m.kind, m.label, m.color])).toEqual([
      [8, "decision", "Decide: Balance", "#123456"],
      [8, "checkpoint", "Untitled project", "#8A9097"],
    ]);
  });
});
