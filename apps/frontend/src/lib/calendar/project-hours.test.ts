import { describe, expect, it } from "vitest";
import { type CalendarEvent, NOT_A_MEETING, type Project } from "$lib/types";
import { projectHours } from "./project-hours";

const weekStart = new Date(2026, 8, 7); // Monday 7 Sep 2026, local

function event(partial: Partial<CalendarEvent> & { start: string; end: string }): CalendarEvent {
  return {
    id: "e",
    calendarId: "c",
    seriesId: null,
    title: "",
    description: null,
    allDay: false,
    declined: false,
    tentative: false,
    readOnly: false,
    countsTowardHours: true,
    url: null,
    mappingScope: "instance",
    activityId: null,
    activityName: null,
    weights: [],
    ...NOT_A_MEETING,
    ...partial,
  };
}

function project(partial: Partial<Project>): Project {
  return {
    id: "p",
    goalId: null,
    categoryId: "cat",
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
    ...partial,
  };
}

describe("projectHours", () => {
  it("sums the week's tagged hours per project, clipped to the week", () => {
    const events = [
      event({ id: "a", projectId: "p", start: "2026-09-08T09:00:00", end: "2026-09-08T11:30:00" }),
      // Straddles Sunday night: only the hour inside the week counts.
      event({ id: "b", projectId: "p", start: "2026-09-13T23:00:00", end: "2026-09-14T01:00:00" }),
      // Untagged and declined blocks count for nothing.
      event({ id: "c", start: "2026-09-08T12:00:00", end: "2026-09-08T13:00:00" }),
      event({
        id: "d",
        projectId: "p",
        countsTowardHours: false,
        start: "2026-09-09T12:00:00",
        end: "2026-09-09T13:00:00",
      }),
    ];
    expect(projectHours(events, [project({})], weekStart)).toEqual([
      { id: "p", name: "Balance", categoryId: "cat", claimedHours: 4, actualHours: 3.5 },
    ]);
  });

  it("drops projects with nothing to say, and everything that isn't live", () => {
    const projects = [
      project({ id: "quiet", hoursPerWeek: 0 }),
      project({ id: "parked", status: "parked", hoursPerWeek: 5 }),
      project({ id: "held", status: "held", hoursPerWeek: 2 }),
    ];
    const events = [event({ id: "a", projectId: "quiet", start: "2026-09-08T09:00:00", end: "2026-09-08T10:00:00" })];
    expect(projectHours(events, projects, weekStart).map((t) => t.id)).toEqual(["quiet", "held"]);
  });

  it("ignores a block that ends before the week starts", () => {
    const events = [event({ id: "a", projectId: "p", start: "2026-09-06T09:00:00", end: "2026-09-06T10:00:00" })];
    expect(projectHours(events, [project({ hoursPerWeek: 0 })], weekStart)).toEqual([]);
  });
});
