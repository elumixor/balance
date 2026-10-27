import { describe, expect, test } from "bun:test";
import { buildOptions, candidatesOf, confidenceOf, eventState, examplesFor, judge, NONE } from "./classify";
import type { ResolvedEvent } from "./events-service";

const spheres = [
  { id: "work", name: "Work" },
  { id: "health", name: "Health" },
];
function event(overrides: Partial<ResolvedEvent> = {}): ResolvedEvent {
  return {
    id: "e1",
    calendarId: "primary",
    seriesId: null,
    seriesStart: null,
    title: "Gym",
    description: null,
    start: new Date("2026-10-12T07:00:00Z"),
    end: new Date("2026-10-12T08:00:00Z"),
    allDay: false,
    status: "confirmed",
    selfResponse: null,
    readOnly: false,
    movable: true,
    url: null,
    location: null,
    conferenceUrl: null,
    conferenceName: null,
    attendees: [],
    organizer: null,
    reminders: [],
    timeZone: "Europe/Prague",
    recurrence: null,
    mapping: null,
    weights: [],
    record: null,
    countsTowardHours: true,
    accountId: "a1",
    ...overrides,
  } as ResolvedEvent;
}

describe("buildOptions", () => {
  test("puts none first, then one option per sphere", () => {
    const { criteria, choices } = buildOptions(spheres);
    expect(Object.keys(criteria)).toEqual([NONE, "s1", "s2"]);
    expect(criteria.s2).toBe('The "Health" part of life');
    expect(choices.get("s2")).toEqual({ categoryId: "health" });
  });
});

describe("examplesFor", () => {
  const filed = [
    { title: "Daily standup", filedAs: "Work" },
    { title: "Daily standup", filedAs: "Work" },
    { title: "Standup retro planning", filedAs: "Admin" },
    { title: "Gym", filedAs: "Health" },
  ];

  test("ranks by shared words and drops repeats", () => {
    expect(examplesFor("Standup retro", filed)).toEqual([
      { title: "Standup retro planning", filedAs: "Admin" },
      { title: "Daily standup", filedAs: "Work" },
    ]);
  });

  test("shares nothing, shows nothing — short words included", () => {
    expect(examplesFor("Lunch", filed)).toEqual([]);
    expect(examplesFor("1:1", filed)).toEqual([]);
  });

  test("keeps to the limit", () => {
    expect(examplesFor("daily standup", filed, 1)).toHaveLength(1);
  });
});

describe("judge", () => {
  const { choices } = buildOptions(spheres);

  test("files a sure answer", () => {
    expect(judge({ choice: "s1", probabilities: { s1: 0.9 } }, 0.8, choices)).toEqual({
      choice: { categoryId: "work" },
      probability: 0.9,
      confidence: 0.8,
      filed: true,
    });
  });

  test("keeps an unsure answer without filing it", () => {
    expect(judge({ choice: "s1", probabilities: { s1: 0.69 } }, 0.9, choices).filed).toBe(false);
    expect(judge({ choice: "s1", probabilities: { s1: 0.95 } }, 0.5, choices).filed).toBe(false);
    expect(judge({ choice: "s1" }, null, choices)).toMatchObject({ probability: null, confidence: null, filed: false });
  });

  test("never files none or an option it doesn't know", () => {
    expect(judge({ choice: NONE, probabilities: { none: 1 } }, 1, choices)).toMatchObject({
      choice: null,
      filed: false,
    });
    expect(judge({ choice: "s9", probabilities: { s9: 1 } }, 1, choices).filed).toBe(false);
  });
});

describe("confidenceOf", () => {
  test("reads the question's confidence and nothing else", () => {
    expect(confidenceOf({ typesafe: { confidence: { purpose: 0.7 } } }, "purpose")).toBe(0.7);
    expect(confidenceOf({ typesafe: { confidence: { purpose: "high" } } }, "purpose")).toBeNull();
    expect(confidenceOf(undefined, "purpose")).toBeNull();
  });
});

describe("candidatesOf", () => {
  const from = new Date("2026-10-12T00:00:00Z");
  const to = new Date("2026-10-19T00:00:00Z");

  test("asks about grey timed blocks in the window, earliest first", () => {
    const events = [
      event({ id: "late", start: new Date("2026-10-14T07:00:00Z") }),
      event({ id: "early" }),
      event({ id: "before", start: new Date("2026-10-01T07:00:00Z") }),
      event({ id: "mapped", mapping: {} as ResolvedEvent["mapping"] }),
      event({ id: "allday", allDay: true }),
      event({ id: "declined", countsTowardHours: false }),
      event({ id: "blank", title: "  " }),
    ];
    expect(candidatesOf(events, from, to).map((candidate) => candidate.event.id)).toEqual(["early", "late"]);
  });

  test("asks about a series once, under its series id", () => {
    const events = [
      event({ id: "s_1", seriesId: "s" }),
      event({ id: "s_2", seriesId: "s", start: new Date("2026-10-13T07:00:00Z") }),
    ];
    expect(candidatesOf(events, from, to)).toEqual([{ event: events[0], scope: "series", externalEventId: "s" }]);
  });

  test("leaves a series alone once a person has filed one of its occurrences", () => {
    const events = [
      event({
        id: "s_0",
        seriesId: "s",
        start: new Date("2026-10-05T07:00:00Z"),
        mapping: {} as ResolvedEvent["mapping"],
      }),
      event({ id: "s_1", seriesId: "s" }),
    ];
    expect(candidatesOf(events, from, to)).toEqual([]);
  });
});

describe("eventState", () => {
  test("says when it is in the event's own zone, and strips the notes", () => {
    const state = eventState(
      event({
        description: "<p>Leg   day</p>",
        organizer: { email: "coach@x.com", name: null, self: false },
        attendees: [
          { email: "me@x.com", name: null, self: true, response: "accepted", optional: false, resource: false },
          { email: "room@x.com", name: null, self: false, response: "accepted", optional: false, resource: true },
          { email: "coach@x.com", name: null, self: false, response: "accepted", optional: false, resource: false },
        ],
      }),
      [],
    );
    expect(state.event).toMatchObject({
      title: "Gym",
      description: "Leg day",
      when: "Monday 09:00",
      minutes: 60,
      organizedBySelf: false,
      organizer: "coach@x.com",
      otherGuests: 1,
    });
  });

  test("an event with no zone or organizer is the person's own, in UTC", () => {
    expect(eventState(event({ timeZone: null }), []).event).toMatchObject({
      when: "Monday 07:00",
      organizedBySelf: true,
      organizer: null,
      description: null,
    });
  });
});
