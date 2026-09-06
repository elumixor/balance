import type { RemindersPrefs, TravelPrefs } from "$lib/account/preferences-types";
import type { ReminderKind } from "$lib/desktop/reminder";

/**
 * When a reminder is due — the one answer the Mac's cards, the phone's notifications and the
 * watch's alarm are all worked out from.
 *
 * Nothing here knows how a reminder is shown. The Mac ticks once a minute and asks "is this due
 * now"; the phone is asleep most of the time and asks "when will this be due" so it can hand the
 * whole list to iOS ahead of time. Both are the same arithmetic, and it only has one right answer
 * per event, so it lives here rather than twice.
 */

/**
 * The parts of an event this reads. A `CalendarEvent` is one; so is anything else that can say
 * whether it takes a whole day and what the calendar itself wanted to be reminded of, which an
 * older cached week may not carry at all.
 */
export interface ReminderSource {
  readonly allDay: boolean;
  readonly reminders?: { method: "popup" | "email"; minutes: number }[] | null;
}

/** The three things worth being told, soonest lead time last. */
export const REMINDER_KINDS = ["leave", "starts", "join"] as const;

/** A meeting gets one more reminder right before it starts, whatever the lead-time preference says. */
export const JOIN_LEAD_MS = 60_000;

/** What the caller already knows about getting there, when it knows anything. */
export interface JourneyEstimate {
  readonly seconds: number;
}

/**
 * When a reminder of this kind is due for this event, or null when it isn't wanted.
 *
 * What's about to start uses the event's own reminder if the calendar carries one, and the
 * preference otherwise; setting off is timed off the journey the caller has looked up. A meeting
 * always gets a second, fixed reminder right before it starts — missing the join link because the
 * lead time was set to twenty minutes isn't something a preference should be able to cause.
 */
export function reminderDueAt(
  event: ReminderSource,
  kind: ReminderKind,
  options: {
    start: number;
    reminders: RemindersPrefs;
    travel: Pick<TravelPrefs, "bufferMinutes">;
    hasJoinLink: boolean;
    journey?: JourneyEstimate | null;
  },
): number | null {
  const { start, reminders, travel, hasJoinLink, journey } = options;
  if (!reminders.enabled || event.allDay) return null;

  if (kind === "join") return hasJoinLink ? start - JOIN_LEAD_MS : null;

  if (kind === "starts") {
    const own = reminders.useCalendarReminders ? popupMinutes(event) : null;
    return start - (own ?? reminders.leadMinutes) * 60_000;
  }

  if (!reminders.leaveInTime || !journey) return null;
  return start - journey.seconds * 1000 - travel.bufferMinutes * 60_000;
}

/** The soonest popup reminder the calendar itself carries, in minutes. */
export function popupMinutes(event: Pick<ReminderSource, "reminders">) {
  const overrides = event.reminders?.filter((reminder) => reminder.method === "popup") ?? [];
  if (overrides.length === 0) return null;
  return Math.min(...overrides.map((reminder) => reminder.minutes));
}
