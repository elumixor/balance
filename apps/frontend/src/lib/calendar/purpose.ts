import type { ActivityWeight } from "$lib/core/records";
import type { EventPatch } from "./queries";
import type { CalendarEvent, EventResponse, EventTimer, MappingScope } from "./types";

/**
 * What an event counts as and what it is for, in the shapes a write takes — and what a block
 * looks like once a write lands, worked out ahead of the answer so the grid can draw it now.
 */

/**
 * What the hour was for — a practice, a Keep task — on top of what it counts as, and how a timer
 * run for it is broken up. All of it rides on the mapping, so all of it travels together.
 */
export interface Purpose {
  readonly practiceId: string | null;
  /** The work it was for in another app, by URN — `keep:page/<id>`. */
  readonly urn: string | null;
  readonly timer: EventTimer | null;
  /** The integration feed it is linked to — "apple-health:sleep" — which is also on the mapping. */
  readonly source: string | null;
  /** The card sections folded away on it; null means the default. */
  readonly hidden: string[] | null;
  /** Where you are once it is over, which is also on the mapping; null leaves you where you were. */
  readonly endLocation: string | null;
  /** Your own notes about it, kept on the mapping so the calendar never carries them. */
  readonly notes: string | null;
}

export const NO_PURPOSE: Purpose = {
  practiceId: null,
  urn: null,
  timer: null,
  source: null,
  hidden: null,
  endLocation: null,
  notes: null,
};

/** What an event counts as, in the shape the mapping endpoints take. */
export interface Mapping {
  readonly scope: MappingScope;
  readonly choice: { activityId?: string; weights?: ActivityWeight[] };
  readonly purpose: Purpose;
}

/** Everything the editor and a drag can change about an event, in the shape a write takes. */
export interface EventFields {
  readonly title: string;
  readonly description: string | null;
  readonly start: Date;
  readonly end: Date;
}

/** What can be said to an invitation — the question itself can't be put back. */
export type Answer = Exclude<EventResponse, "needsAction">;

/** What the event counts as right now, in the shape a write takes — so an undo can put it back. */
export function mappingOf(event: CalendarEvent): Mapping | null {
  if (!event.mappingScope) return null;
  return {
    scope: event.mappingScope,
    choice: event.activityId ? { activityId: event.activityId } : { weights: event.weights },
    purpose: purposeOf(event),
  };
}

export function purposeOf(event: CalendarEvent): Purpose {
  return {
    practiceId: event.practiceId,
    urn: event.urn,
    timer: event.timer,
    source: event.source,
    hidden: event.hidden,
    endLocation: event.endLocation,
    notes: event.notes,
  };
}

/** A copy or a restore counts as, and is for, what the original was — in the create itself. */
export function mappingFieldsOf(was: CalendarEvent) {
  return {
    activityId: was.activityId ?? undefined,
    weights: !was.activityId && was.mappingScope === "instance" && was.weights.length > 0 ? was.weights : undefined,
    practiceId: was.practiceId ?? undefined,
    urn: was.urn ?? undefined,
    timer: was.timer ?? undefined,
    source: was.source ?? undefined,
    hidden: was.hidden ?? undefined,
    endLocation: was.endLocation ?? undefined,
    notes: was.notes ?? undefined,
  };
}

/** The block as the write will leave it, as far as this screen can tell before the answer. */
export function drawnWith(event: CalendarEvent, patch: EventPatch): CalendarEvent {
  return {
    ...event,
    ...(patch.location === undefined ? {} : { location: patch.location || null }),
    ...(patch.timeZone === undefined ? {} : { timeZone: patch.timeZone }),
    ...(patch.start === undefined ? {} : { start: patch.start }),
    ...(patch.end === undefined ? {} : { end: patch.end }),
    ...(patch.reminders === undefined ? {} : { reminders: patch.reminders }),
    // The rule shows on the card at once; the occurrences it makes or takes away land with the refetch.
    ...(patch.recurrence === undefined ? {} : { recurrence: patch.recurrence.length ? [...patch.recurrence] : null }),
    ...(patch.conference === "remove" ? { conferenceUrl: null, conferenceName: null } : {}),
    // A pasted call is drawn as the card will show it before the calendar has answered; a Meet
    // can't be, since only Google knows the link it is about to mint.
    ...(typeof patch.conference === "object"
      ? { conferenceUrl: patch.conference.url, conferenceName: patch.conference.name }
      : {}),
    ...(patch.attendees === undefined
      ? {}
      : {
          attendees: patch.attendees.map((guest) => {
            const known = event.attendees.find((a) => a.email?.toLowerCase() === guest.email.toLowerCase());
            return (
              known ?? {
                email: guest.email,
                name: null,
                self: false,
                response: "needsAction",
                optional: guest.optional === true,
              }
            );
          }),
        }),
  };
}

/** The event as the calendar will describe it once the reply lands — the same rules the server applies. */
export function answered(event: CalendarEvent, response: Answer): CalendarEvent {
  return {
    ...event,
    response,
    declined: response === "declined",
    // Tentative is also the event's own status, which the reply doesn't change.
    tentative: response === "tentative" || (event.tentative && event.response !== "tentative"),
    countsTowardHours: !event.allDay && response !== "declined",
    attendees: event.attendees.map((guest) => (guest.self ? { ...guest, response } : guest)),
  };
}

export function sameFields(a: EventFields, b: EventFields) {
  return (
    a.title === b.title &&
    (a.description ?? "") === (b.description ?? "") &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime()
  );
}
