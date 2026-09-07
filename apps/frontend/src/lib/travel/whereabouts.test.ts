import { describe, expect, it } from "vitest";
import { type CalendarEvent, NOT_A_MEETING } from "$lib/calendar/types";
import { placeBefore } from "./whereabouts";

const HOME = "Grote Markt 1, Antwerpen";
const OFFICE = "Meir 20, Antwerpen";
const KYIV = "Kyiv";

function at(hour: number, day = 7) {
  return `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    calendarId: "cal",
    seriesId: null,
    title: overrides.id,
    description: null,
    start: at(10),
    end: at(11),
    allDay: false,
    declined: false,
    tentative: false,
    readOnly: false,
    movable: true,
    countsTowardHours: true,
    url: null,
    mappingScope: null,
    activityId: null,
    activityName: null,
    weights: [],
    ...NOT_A_MEETING,
    ...overrides,
  };
}

const next = event({ id: "next", start: at(15), end: at(16), location: "Somewhere 5, Gent" });

describe("placeBefore", () => {
  it("is nowhere when nothing on the calendar moved you", () => {
    const office = event({ id: "office", start: at(8), end: at(12), location: OFFICE });
    const call = event({ id: "call", start: at(13), end: at(14), conferenceUrl: "https://meet.google.com/x" });
    expect(placeBefore(next, [office, call, next])).toBeNull();
  });

  it("is wherever the last move left you, however long ago", () => {
    const flight = event({ id: "flight", start: at(8, 1), end: at(9, 1), location: "Airport", endLocation: KYIV });
    expect(placeBefore(next, [flight, next])).toEqual({ address: KYIV, event: flight });
  });

  it("an event with a location but no end place changes nothing", () => {
    const move = event({ id: "move", start: at(8), end: at(9), endLocation: HOME });
    const office = event({ id: "office", start: at(11), end: at(12), location: OFFICE });
    expect(placeBefore(next, [move, office, next])?.address).toBe(HOME);
  });

  it("the latest move wins, whatever order the events come in", () => {
    const home = event({ id: "home", start: at(8), end: at(9), endLocation: HOME });
    const office = event({ id: "office", start: at(11), end: at(12), endLocation: OFFICE });
    expect(placeBefore(next, [home, office, next])?.event.id).toBe("office");
    expect(placeBefore(next, [office, home, next])?.event.id).toBe("office");
  });

  it("ignores declined events and the event itself", () => {
    const declined = event({ id: "no", start: at(13), end: at(14), endLocation: OFFICE, declined: true });
    const self = { ...next, endLocation: OFFICE };
    expect(placeBefore(self, [declined, self])).toBeNull();
  });

  it("does not count a move that hasn't finished — a later event, or one still running", () => {
    const later = event({ id: "later", start: at(17), end: at(18), endLocation: OFFICE });
    const running = event({ id: "running", start: at(14), end: at(16), endLocation: OFFICE });
    expect(placeBefore(next, [later, running, next])).toBeNull();
  });
});
