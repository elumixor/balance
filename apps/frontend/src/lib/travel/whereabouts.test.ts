import { describe, expect, it } from "vitest";
import { type CalendarEvent, NOT_A_MEETING } from "$lib/calendar/types";
import { placeBefore, STILL_THERE_MS } from "./whereabouts";

const HOME = "Grote Markt 1, Antwerpen";
const OFFICE = "Meir 20, Antwerpen";
const KYIV = "Kyiv, Ukraine";

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
    expect(placeBefore(next, [next, event({ id: "call", conferenceUrl: "https://meet.google.com/x" })])).toBeNull();
  });

  it("is where the meeting that just ended was", () => {
    const dentist = event({ id: "dentist", start: at(13), end: at(14), location: OFFICE });
    expect(placeBefore(next, [dentist, next])).toEqual({ address: OFFICE, event: dentist });
  });

  it("forgets an unmarked meeting once you have had time to leave it", () => {
    const early = event({ id: "early", start: at(8), end: at(9), location: OFFICE });
    expect(placeBefore(next, [early, next])).toBeNull();
    const leftAt = new Date(new Date(at(15)).getTime() - STILL_THERE_MS).toISOString();
    const justInTime = event({ id: "edge", start: at(12), end: leftAt, location: OFFICE });
    expect(placeBefore(next, [justInTime, next])?.event.id).toBe("edge");
  });

  it("ignores rooms, links, declined events and the event itself", () => {
    const room = event({ id: "room", start: at(14), end: "2026-09-07T14:30:00.000Z", location: "Room Aurora" });
    const declined = event({ id: "no", start: at(14), end: at(15), location: OFFICE, declined: true });
    const self = { ...next, location: OFFICE };
    expect(placeBefore(self, [room, declined, self])).toBeNull();
  });

  it("does not count a meeting that hasn't happened yet, or one running over the start", () => {
    const later = event({ id: "later", start: at(17), end: at(18), location: OFFICE });
    const running = event({ id: "running", start: at(14), end: at(16), location: OFFICE });
    expect(placeBefore(next, [later, running, next])).toBeNull();
  });

  it("a timed place change holds until the next one, however long ago it ended", () => {
    const move = event({ id: "move", start: at(8, 1), end: at(12, 1), location: HOME, placeChange: true });
    expect(placeBefore(next, [move, next])).toEqual({ address: HOME, event: move });
    const later = event({ id: "later", start: at(9, 3), end: at(10, 3), location: OFFICE, placeChange: true });
    expect(placeBefore(next, [move, later, next])?.event.id).toBe("later");
  });

  it("a place change with no address still counts — a city is somewhere to leave from", () => {
    const flight = event({ id: "flight", start: at(8), end: at(12), location: "Kyiv", placeChange: true });
    expect(placeBefore(next, [flight, next])?.address).toBe("Kyiv");
  });

  it("an all-day place change is a trip: there for its days, and gone once it's over", () => {
    const trip = event({ id: "trip", start: at(0, 5), end: at(0, 9), allDay: true, location: KYIV, placeChange: true });
    expect(placeBefore(next, [trip, next])).toEqual({ address: KYIV, event: trip });
    const after = { ...next, start: at(15, 9), end: at(16, 9) };
    expect(placeBefore(after, [trip, after])).toBeNull();
    const before = { ...next, start: at(15, 4), end: at(16, 4) };
    expect(placeBefore(before, [trip, before])).toBeNull();
  });

  it("an all-day event that is not marked moves nobody", () => {
    const party = event({ id: "party", start: at(0), end: at(0, 8), allDay: true, location: OFFICE });
    expect(placeBefore(next, [party, next])).toBeNull();
  });

  it("a finished trip takes the moves made during it with it", () => {
    const move = event({ id: "home", start: at(8, 1), end: at(9, 1), location: HOME, placeChange: true });
    const trip = event({ id: "trip", start: at(0, 3), end: at(0, 6), allDay: true, location: KYIV, placeChange: true });
    const hotel = event({
      id: "hotel",
      start: at(15, 3),
      end: at(16, 3),
      location: "Hotel 1, Kyiv",
      placeChange: true,
    });
    expect(placeBefore(next, [move, trip, hotel, next])?.event.id).toBe("home");
    const during = { ...next, start: at(10, 4), end: at(11, 4) };
    expect(placeBefore(during, [move, trip, hotel, during])?.event.id).toBe("hotel");
  });

  it("the latest move wins, and a deliberate one over a meeting that ended at the same time", () => {
    const meeting = event({ id: "meeting", start: at(13), end: at(14), location: OFFICE });
    const move = event({ id: "move", start: at(12), end: at(14), location: HOME, placeChange: true });
    expect(placeBefore(next, [meeting, move, next])?.event.id).toBe("move");
    expect(placeBefore(next, [move, meeting, next])?.event.id).toBe("move");
    const later = event({ id: "later", start: at(14), end: "2026-09-07T14:30:00.000Z", location: OFFICE });
    expect(placeBefore(next, [move, later, next])?.event.id).toBe("later");
  });
});
