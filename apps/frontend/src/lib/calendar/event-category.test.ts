import { describe, expect, it } from "vitest";
import type { Category } from "$lib/core/records";
import { eventCategory } from "./event-category";
import type { CalendarEvent } from "./types";
import { NOT_A_MEETING } from "./types";

function category(id: string, extra: Partial<Category> = {}): Category {
  return { id, name: id, color: "#C4553B", icon: "book", targetHoursPerWeek: 10, isBuffer: false, ...extra };
}

function event(
  start: Date,
  end: Date,
  weights: { categoryId: string; weightPercent: number }[],
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: start.toISOString(),
    calendarId: "acc::cal",
    seriesId: null,
    seriesStart: null,
    title: "",
    description: null,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    declined: false,
    tentative: false,
    readOnly: false,
    movable: true,
    countsTowardHours: true,
    url: null,
    mappingScope: "instance",
    activityId: null,
    activityName: null,
    weights,
    ...NOT_A_MEETING,
    ...extra,
  };
}

const MONDAY = new Date(2026, 7, 10);
const deep = category("deep");
const rest = category("rest", { isBuffer: true, color: "#3B8E9E", icon: "moon", targetHoursPerWeek: 0 });

describe("eventCategory", () => {
  const categories = new Map([
    ["deep", deep],
    ["shallow", category("shallow")],
    ["rest", rest],
  ]);

  it("is the heaviest slice of the mix", () => {
    const mixed = event(MONDAY, MONDAY, [
      { categoryId: "shallow", weightPercent: 30 },
      { categoryId: "deep", weightPercent: 70 },
    ]);
    expect(eventCategory(mixed, categories)?.id).toBe("deep");
  });

  it("skips the buffer, so an hour that mostly buffers still shows what it partly was", () => {
    const mostlyRest = event(MONDAY, MONDAY, [
      { categoryId: "rest", weightPercent: 90 },
      { categoryId: "deep", weightPercent: 10 },
    ]);
    expect(eventCategory(mostlyRest, categories)?.id).toBe("deep");
  });

  it("is null when nothing is mapped or nothing mapped still exists", () => {
    expect(eventCategory(event(MONDAY, MONDAY, []), categories)).toBeNull();
    expect(eventCategory(event(MONDAY, MONDAY, [{ categoryId: "gone", weightPercent: 100 }]), categories)).toBeNull();
    expect(eventCategory(event(MONDAY, MONDAY, [{ categoryId: "rest", weightPercent: 100 }]), categories)).toBeNull();
  });

  it("doesn't reorder the event's own weights while ranking them", () => {
    const weights = [
      { categoryId: "shallow", weightPercent: 30 },
      { categoryId: "deep", weightPercent: 70 },
    ];
    eventCategory(event(MONDAY, MONDAY, weights), categories);
    expect(weights.map((w) => w.categoryId)).toEqual(["shallow", "deep"]);
  });
});
