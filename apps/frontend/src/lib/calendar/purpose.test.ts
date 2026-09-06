import { describe, expect, it } from "vitest";
import {
  answered,
  drawnWith,
  type EventFields,
  mappingFieldsOf,
  mappingOf,
  mergePurpose,
  NO_PURPOSE,
  purposeOf,
  sameFields,
} from "./purpose";
import { type CalendarEvent, type EventAttendee, NOT_A_MEETING } from "./types";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1",
    calendarId: "cal",
    seriesId: null,
    title: "Deep work",
    description: null,
    start: "2026-09-07T08:00:00.000Z",
    end: "2026-09-07T09:00:00.000Z",
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

const guest = (email: string, self = false, response: EventAttendee["response"] = "needsAction"): EventAttendee => ({
  email,
  name: null,
  self,
  response,
  optional: false,
});

describe("mappingOf", () => {
  it("is nothing for an event that counts as nothing", () => {
    expect(mappingOf(event())).toBeNull();
  });

  it("names the activity when there is one, and the weights otherwise", () => {
    const weights = [{ categoryId: "c1", weightPercent: 100 }];
    expect(mappingOf(event({ mappingScope: "instance", activityId: "a1", weights }))).toEqual({
      scope: "instance",
      choice: { activityId: "a1" },
      purpose: NO_PURPOSE,
    });
    expect(mappingOf(event({ mappingScope: "series", weights, projectId: "p1" }))).toEqual({
      scope: "series",
      choice: { weights },
      purpose: { ...NO_PURPOSE, projectId: "p1" },
    });
  });
});

describe("mergePurpose", () => {
  const was = { ...NO_PURPOSE, projectId: "p1", taskId: "t1" };

  it("a practice takes the project and its task with it", () => {
    expect(mergePurpose(was, { practiceId: "pr1" })).toEqual({ ...NO_PURPOSE, practiceId: "pr1" });
  });

  it("clearing the project clears its task", () => {
    expect(mergePurpose(was, { projectId: null })).toEqual(NO_PURPOSE);
  });

  it("a project or a task takes the practice's place", () => {
    const practised = { ...NO_PURPOSE, practiceId: "pr1" };
    expect(mergePurpose(practised, { projectId: "p2" })).toEqual({ ...NO_PURPOSE, projectId: "p2" });
    expect(mergePurpose(practised, { taskId: "t2" })).toEqual({ ...NO_PURPOSE, taskId: "t2" });
  });

  it("anything else lays over what was there", () => {
    expect(mergePurpose(was, { hidden: ["where"] })).toEqual({ ...was, hidden: ["where"] });
  });
});

describe("purposeOf and mappingFieldsOf", () => {
  it("reads the purpose off the event", () => {
    const timer = { kind: "every" as const, minutes: 25 };
    expect(purposeOf(event({ practiceId: "pr1", timer, source: "apple-health:sleep", hidden: ["who"] }))).toEqual({
      ...NO_PURPOSE,
      practiceId: "pr1",
      timer,
      source: "apple-health:sleep",
      hidden: ["who"],
    });
  });

  it("carries an activity into a copy, and only an instance's own weights", () => {
    const weights = [{ categoryId: "c1", weightPercent: 100 }];
    expect(mappingFieldsOf(event({ activityId: "a1", mappingScope: "instance", weights }))).toMatchObject({
      activityId: "a1",
      weights: undefined,
    });
    expect(mappingFieldsOf(event({ mappingScope: "instance", weights })).weights).toEqual(weights);
    // A series' weights come from the series mapping, which the copy doesn't belong to.
    expect(mappingFieldsOf(event({ mappingScope: "series", weights })).weights).toBeUndefined();
    expect(mappingFieldsOf(event({ mappingScope: "instance", weights: [] })).weights).toBeUndefined();
  });

  it("leaves absent purpose fields out rather than sending nulls", () => {
    const timer = { kind: "parts" as const, count: 3 };
    expect(mappingFieldsOf(event({ projectId: "p1", taskId: "t1", timer, source: "s", hidden: [] }))).toEqual({
      activityId: undefined,
      weights: undefined,
      projectId: "p1",
      practiceId: undefined,
      taskId: "t1",
      timer,
      source: "s",
      hidden: [],
    });
  });
});

describe("drawnWith", () => {
  it("changes nothing for an empty patch", () => {
    const was = event({ location: "Room 1" });
    expect(drawnWith(was, {})).toEqual(was);
  });

  it("clears the place with an empty string and takes the call off", () => {
    const was = event({ location: "Room 1", conferenceUrl: "https://meet", conferenceName: "Meet" });
    expect(drawnWith(was, { location: "", conference: "remove" })).toMatchObject({
      location: null,
      conferenceUrl: null,
      conferenceName: null,
    });
    expect(drawnWith(was, { location: "Room 2", conference: "create" })).toMatchObject({
      location: "Room 2",
      conferenceUrl: "https://meet",
    });
  });

  it("moves times, zone, reminders and the rule at once", () => {
    const reminders = [{ method: "popup" as const, minutes: 10 }];
    const drawn = drawnWith(event(), {
      start: "2026-09-08T08:00:00.000Z",
      end: "2026-09-08T09:00:00.000Z",
      timeZone: "Europe/Kyiv",
      reminders,
      recurrence: ["RRULE:FREQ=DAILY"],
    });
    expect(drawn).toMatchObject({
      start: "2026-09-08T08:00:00.000Z",
      end: "2026-09-08T09:00:00.000Z",
      timeZone: "Europe/Kyiv",
      reminders,
      recurrence: ["RRULE:FREQ=DAILY"],
    });
    // An empty rule makes a one-off, which the event says as null rather than [].
    expect(drawnWith(event({ recurrence: ["RRULE:FREQ=DAILY"] }), { recurrence: [] }).recurrence).toBeNull();
  });

  it("keeps what is known about a guest who stays, and adds the new ones unanswered", () => {
    const known = guest("A@x.io", false, "accepted");
    const drawn = drawnWith(event({ attendees: [known, guest("gone@x.io")] }), {
      attendees: [{ email: "a@x.io" }, { email: "new@x.io", optional: true }],
    });
    expect(drawn.attendees).toEqual([
      known,
      { email: "new@x.io", name: null, self: false, response: "needsAction", optional: true },
    ]);
  });

  it("a guest without an address never matches", () => {
    const anonymous = { ...guest("x@x.io"), email: null };
    const drawn = drawnWith(event({ attendees: [anonymous] }), { attendees: [{ email: "x@x.io" }] });
    expect(drawn.attendees[0]).toMatchObject({ email: "x@x.io", optional: false });
  });
});

describe("answered", () => {
  it("a no takes the hour out of the totals and marks the reply on the guest that is you", () => {
    const was = event({ attendees: [guest("me@x.io", true), guest("them@x.io")], response: "accepted" });
    const no = answered(was, "declined");
    expect(no).toMatchObject({ response: "declined", declined: true, tentative: false, countsTowardHours: false });
    expect(no.attendees.map((a) => a.response)).toEqual(["declined", "needsAction"]);
  });

  it("a yes counts unless the event is all day", () => {
    expect(answered(event({ declined: true }), "accepted")).toMatchObject({ declined: false, countsTowardHours: true });
    expect(answered(event({ allDay: true }), "accepted").countsTowardHours).toBe(false);
  });

  it("tentative is the reply, or the event's own status when the reply wasn't what made it so", () => {
    expect(answered(event(), "tentative").tentative).toBe(true);
    // The event was tentative on its own; saying yes doesn't change that.
    expect(answered(event({ tentative: true, response: "accepted" }), "accepted").tentative).toBe(true);
    // The event was only tentative because of the reply; a yes takes it back.
    expect(answered(event({ tentative: true, response: "tentative" }), "accepted").tentative).toBe(false);
  });
});

describe("sameFields", () => {
  const fields: EventFields = {
    title: "A",
    description: null,
    start: new Date("2026-09-07T08:00:00.000Z"),
    end: new Date("2026-09-07T09:00:00.000Z"),
  };

  it("reads no notes and empty notes as the same thing", () => {
    expect(sameFields(fields, { ...fields, description: "" })).toBe(true);
    expect(sameFields(fields, { ...fields, start: new Date(fields.start) })).toBe(true);
  });

  it("notices each field on its own", () => {
    expect(sameFields(fields, { ...fields, title: "B" })).toBe(false);
    expect(sameFields(fields, { ...fields, description: "notes" })).toBe(false);
    expect(sameFields(fields, { ...fields, start: new Date("2026-09-07T08:15:00.000Z") })).toBe(false);
    expect(sameFields(fields, { ...fields, end: new Date("2026-09-07T09:15:00.000Z") })).toBe(false);
  });
});
