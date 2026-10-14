import { describe, expect, test } from "bun:test";
import { buildOptions, candidatesOf, confidenceOf, eventState, examplesFor, judge, NONE } from "./classify";
import type { ResolvedEvent } from "./events-service";

const spheres = [
  { id: "work", name: "Work" },
  { id: "health", name: "Health" },
];
const projects = [
  { id: "atma", parentId: null, categoryId: "work", name: "ATMA", description: "" },
  { id: "combat", parentId: "atma", categoryId: "work", name: "Combat", description: "  Melee system  " },
  { id: "orphan", parentId: null, categoryId: "gone", name: "Orphan", description: "" },
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
  test("puts none first, then spheres, then projects with their path and sphere", () => {
    const { criteria, choices } = buildOptions(spheres, projects);
    expect(Object.keys(criteria)).toEqual([NONE, "s1", "s2", "p1", "p2"]);
    expect(criteria.p2).toBe('Work on the project "ATMA › Combat" (part of Work): Melee system');
    expect(choices.get("s2")).toEqual({ categoryId: "health", projectId: null });
    expect(choices.get("p2")).toEqual({ categoryId: "work", projectId: "combat" });
  });

  test("drops a project whose sphere is not on the ring", () => {
    const { choices } = buildOptions(spheres, projects);
    expect([...choices.values()].some((choice) => choice.projectId === "orphan")).toBe(false);
  });

  test("survives a parent cycle and names an unnamed project", () => {
    const loop = [
      { id: "a", parentId: "b", categoryId: "work", name: "", description: "" },
      { id: "b", parentId: "a", categoryId: "work", name: "B", description: "" },
    ];
    expect(buildOptions(spheres, loop).criteria.p1).toBe('Work on the project "B › Untitled" (part of Work)');
  });
});

describe("examplesFor", () => {
  const filed = [
    { title: "Daily standup", filedAs: "project ATMA" },
    { title: "Daily standup", filedAs: "project ATMA" },
    { title: "Standup retro planning", filedAs: "Work in general" },
    { title: "Gym", filedAs: "Health in general" },
  ];

  test("ranks by shared words and drops repeats", () => {
    expect(examplesFor("Standup retro", filed)).toEqual([
      { title: "Standup retro planning", filedAs: "Work in general" },
      { title: "Daily standup", filedAs: "project ATMA" },
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
  const { choices } = buildOptions(spheres, projects);

  test("files a sure answer", () => {
    expect(judge({ choice: "p1", probabilities: { p1: 0.9 } }, 0.8, choices)).toEqual({
      choice: { categoryId: "work", projectId: "atma" },
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
    expect(judge({ choice: "p9", probabilities: { p9: 1 } }, 1, choices).filed).toBe(false);
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
