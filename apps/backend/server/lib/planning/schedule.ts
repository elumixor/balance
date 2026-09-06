import { addDays, type Day, dayIn, timeOn, weekdayOf } from "./days";
import type { Slot } from "./types";

/**
 * When the next reminders are due.
 *
 * The phone is asleep at 18:00, so nothing can be decided then: the whole list is worked out ahead
 * and handed to `UNUserNotificationCenter`, the same way event reminders already are. This is the
 * arithmetic that says which slots fall in the window, and it is kept pure so the two days a year
 * the clocks move can be tested rather than hoped about.
 */

export interface ScheduledSlot {
  slot: Slot;
  /** The day the session is *about* — the reviewed day, which is the day the reminder fires on. */
  day: Day;
  at: Date;
}

export interface SlotPreferences {
  enabled: boolean;
  eveningTime: string;
  morningTime: string;
  weeklyWeekday: number;
  weeklyTime: string;
}

/** Two days is well inside the 64 pending notifications iOS keeps, alongside event reminders. */
export const HORIZON_MS = 48 * 60 * 60_000;

/**
 * Every slot due between now and the horizon, soonest first.
 *
 * The weekly sitting replaces that evening's reminder rather than arriving beside it — two banners
 * a minute apart is how an app teaches someone to swipe both away without reading either.
 */
export function upcomingSlots(options: {
  preferences: SlotPreferences;
  timeZone: string;
  now: Date;
  horizonMs?: number;
}): ScheduledSlot[] {
  const { preferences, timeZone, now } = options;
  if (!preferences.enabled) return [];

  const horizon = now.getTime() + (options.horizonMs ?? HORIZON_MS);
  const today = dayIn(timeZone, now);
  const slots: ScheduledSlot[] = [];

  for (let offset = 0; offset <= 3; offset++) {
    const day = addDays(today, offset);
    const weekly = weekdayOf(day) === preferences.weeklyWeekday;
    slots.push({ slot: "morning", day, at: timeOn(day, timeZone, preferences.morningTime) });
    slots.push({
      slot: weekly ? "weekly" : "evening",
      day,
      at: timeOn(day, timeZone, weekly ? preferences.weeklyTime : preferences.eveningTime),
    });
  }

  return slots
    .filter((slot) => slot.at.getTime() > now.getTime() && slot.at.getTime() <= horizon)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Whether a slot is close enough for its words to be worth writing.
 *
 * An evening's copy composed at breakfast would describe a day that has not happened. Outside this
 * window the reminder is scheduled with the plain arithmetic version instead, and replaced by the
 * written one on the next foreground that falls inside it.
 */
export const FRESH_WINDOW_MS = 3 * 60 * 60_000;

export function isFresh(slot: ScheduledSlot, now: Date) {
  return slot.at.getTime() - now.getTime() <= FRESH_WINDOW_MS;
}
