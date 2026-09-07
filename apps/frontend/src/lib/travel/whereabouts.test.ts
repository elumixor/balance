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
    seriesStart: null,
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
  it("is nowhere when nothing on the calendar has a place", () => {
    const call = event({ id: "call", start: at(13), end: at(14), conferenceUrl: "https://meet.google.com/x" });
    const work = event({ id: "work", start: at(8), end: at(12) });
    expect(placeBefore(next, [call, work, next])).toBeNull();
  });

  it("is wherever the last event with a place put you, however long ago", () => {
    const dentist = event({ id: "dentist", start: at(8, 1), end: at(9, 1), location: OFFICE });
    expect(placeBefore(next, [dentist, next])).toEqual({ address: OFFICE, event: dentist });
  });

  it("an end place beats the location: a flight leaves you where it lands", () => {
    const flight = event({ id: "flight", start: at(8), end: at(12), location: "Airport", endLocation: KYIV });
    expect(placeBefore(next, [flight, next])).toEqual({ address: KYIV, event: flight });
    const move = event({ id: "move", start: at(8), end: at(9), endLocation: HOME });
    expect(placeBefore(next, [move, next])?.address).toBe(HOME);
  });

  it("an event with no place changes nothing", () => {
    const office = event({ id: "office", start: at(9), end: at(10), location: OFFICE });
    const lunch = event({ id: "lunch", start: at(12), end: at(13) });
    expect(placeBefore(next, [office, lunch, next])?.event.id).toBe("office");
  });

  it("the latest place wins, whatever order the events come in", () => {
    const home = event({ id: "home", start: at(8), end: at(9), location: HOME });
    const office = event({ id: "office", start: at(11), end: at(12), location: OFFICE });
    expect(placeBefore(next, [home, office, next])?.event.id).toBe("office");
    expect(placeBefore(next, [office, home, next])?.event.id).toBe("office");
  });

  it("a city is a place too — it only needs to be somewhere, not an address", () => {
    const flight = event({ id: "flight", start: at(8), end: at(12), location: KYIV });
    expect(placeBefore(next, [flight, next])?.address).toBe(KYIV);
  });

  it("ignores links, declined events and the event itself", () => {
    const declined = event({ id: "no", start: at(13), end: at(14), location: OFFICE, declined: true });
    const link = event({ id: "link", start: at(13), end: at(14), location: "https://zoom.us/j/1" });
    const self = { ...next, location: OFFICE, endLocation: HOME };
    expect(placeBefore(self, [declined, link, self])).toBeNull();
  });

  it("does not count a place you haven't got to yet — a later event, or one still running", () => {
    const later = event({ id: "later", start: at(17), end: at(18), location: OFFICE });
    const running = event({ id: "running", start: at(14), end: at(16), endLocation: OFFICE });
    expect(placeBefore(next, [later, running, next])).toBeNull();
  });

  it("an all-day event is a place from the start of its day, unless it ends somewhere else", () => {
    const trip = event({ id: "trip", start: at(0), end: at(0, 8), allDay: true, location: KYIV });
    expect(placeBefore(next, [trip, next])?.event.id).toBe("trip");
    const office = event({ id: "office", start: at(9), end: at(10), location: OFFICE });
    expect(placeBefore(next, [trip, office, next])?.event.id).toBe("office");
    const yesterday = { ...next, start: at(15, 6), end: at(16, 6) };
    expect(placeBefore(yesterday, [trip, yesterday])).toBeNull();
    const travelDay = { ...trip, endLocation: HOME };
    expect(placeBefore(next, [travelDay, next])).toBeNull();
  });
});
