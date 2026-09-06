import { describe, expect, it } from "vitest";
import type { Category } from "$lib/core/records";
import { restColor } from "$lib/ui/colors";
import { DEFAULT_ICON } from "$lib/ui/icons";
import { eventCategory } from "./event-category";
import type { CalendarEvent } from "./types";
import { NOT_A_MEETING } from "./types";
import { weekTotals } from "./week-totals";

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

describe("weekTotals", () => {
  it("counts an event's hours against its category", () => {
    const totals = weekTotals(
      [event(new Date(2026, 7, 10, 9), new Date(2026, 7, 10, 11, 30), [{ categoryId: "deep", weightPercent: 100 }])],
      [deep],
      MONDAY,
    );
    expect(totals[0].actualHours).toBeCloseTo(2.5, 6);
    expect(totals[0].plannedHours).toBe(10);
  });

  it("splits an event across the categories it's a mix of", () => {
    const other = category("shallow");
    const totals = weekTotals(
      [
        event(new Date(2026, 7, 10, 9), new Date(2026, 7, 10, 13), [
          { categoryId: "deep", weightPercent: 75 },
          { categoryId: "shallow", weightPercent: 25 },
        ]),
      ],
      [deep, other],
      MONDAY,
    );
    expect(totals.map((t) => t.actualHours)).toEqual([3, 1]);
  });

  it("counts only the part of an event that falls inside the week", () => {
    // Sunday 22:00 to Monday 02:00: two hours belong to this week and two to the next.
    const straddle = event(new Date(2026, 7, 16, 22), new Date(2026, 7, 17, 2), [
      { categoryId: "deep", weightPercent: 100 },
    ]);
    expect(weekTotals([straddle], [deep], MONDAY)[0].actualHours).toBeCloseTo(2, 6);
    expect(weekTotals([straddle], [deep], new Date(2026, 7, 17))[0].actualHours).toBeCloseTo(2, 6);
  });

  it("ignores events outside the week entirely", () => {
    const before = event(new Date(2026, 7, 3, 9), new Date(2026, 7, 3, 10), [
      { categoryId: "deep", weightPercent: 100 },
    ]);
    const after = event(new Date(2026, 7, 20, 9), new Date(2026, 7, 20, 10), [
      { categoryId: "deep", weightPercent: 100 },
    ]);
    expect(weekTotals([before, after], [deep], MONDAY)[0].actualHours).toBe(0);
  });

  it("ignores an event that was declined or otherwise doesn't count", () => {
    const declined = event(
      new Date(2026, 7, 10, 9),
      new Date(2026, 7, 10, 17),
      [{ categoryId: "deep", weightPercent: 100 }],
      { countsTowardHours: false },
    );
    expect(weekTotals([declined], [deep], MONDAY)[0].actualHours).toBe(0);
  });

  it("ignores an event that ends before it starts rather than subtracting hours", () => {
    const backwards = event(new Date(2026, 7, 10, 17), new Date(2026, 7, 10, 9), [
      { categoryId: "deep", weightPercent: 100 },
    ]);
    expect(weekTotals([backwards], [deep], MONDAY)[0].actualHours).toBe(0);
  });

  it("gives the buffer whatever the week has left, and never a negative", () => {
    const empty = weekTotals([], [deep, rest], MONDAY);
    expect(empty[1].actualHours).toBe(168);

    const overbooked = Array.from({ length: 8 }, (_, day) =>
      event(new Date(2026, 7, 10 + day, 0), new Date(2026, 7, 11 + day, 0), [
        { categoryId: "deep", weightPercent: 100 },
      ]),
    );
    const totals = weekTotals(overbooked, [deep, rest], MONDAY);
    expect(totals[0].actualHours).toBeCloseTo(168, 6);
    expect(totals[1].actualHours).toBe(0);
  });

  it("keeps hours mapped to the buffer out of the claimed total, so rest stays rest", () => {
    const buffered = event(new Date(2026, 7, 10, 9), new Date(2026, 7, 10, 19), [
      { categoryId: "rest", weightPercent: 100 },
    ]);
    const totals = weekTotals([buffered], [deep, rest], MONDAY);
    expect(totals[1].actualHours).toBe(168);
  });

  it("draws the buffer in the neutral, whatever it was given", () => {
    const [, buffer] = weekTotals([], [deep, rest], MONDAY);
    expect(buffer.color).toBe(restColor);
    expect(buffer.icon).toBe(DEFAULT_ICON);
  });

  it("counts time against a category that isn't on the list without inventing a row for it", () => {
    const totals = weekTotals(
      [event(new Date(2026, 7, 10, 9), new Date(2026, 7, 10, 10), [{ categoryId: "archived", weightPercent: 100 }])],
      [deep, rest],
      MONDAY,
    );
    expect(totals.map((t) => t.id)).toEqual(["deep", "rest"]);
    // The hour is claimed, so it comes off rest even though nothing on screen shows it.
    expect(totals[1].actualHours).toBe(167);
  });
});

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
