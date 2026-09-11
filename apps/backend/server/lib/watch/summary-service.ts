import { addDays } from "date-fns";
import { CalendarEventsService, type ResolvedEvent } from "~/lib/calendar/events-service";
import { qualifyCalendarId } from "~/lib/calendar/ids";
import type { EventReminder } from "~/lib/calendar/types";
import { ApiError } from "~/lib/http/api-error";
import { PreferencesService } from "~/lib/preferences/service";
import { categoryStatsCalculator } from "~/lib/stats/category-stats";
import { periodResolver } from "~/lib/stats/period";
import { StatsRepository } from "~/lib/stats/queries";
import type { CategoryInput, Period } from "~/lib/stats/types";
import { dominantCategoryId } from "~/lib/tracking/match";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/** How far ahead "what's next" is worth looking. Past a fortnight, nothing is next any more. */
const LOOKAHEAD_DAYS = 14;

/**
 * How many of those the wrist is sent. The upcoming list is a screen somebody scrolls for a few
 * seconds, not an agenda — and every event costs bytes on a watch that may be asking over
 * Bluetooth.
 */
const UPCOMING_LIMIT = 20;
const DAYS_PER_WEEK = 7;

/**
 * Everything a watch face draws in one round trip: how this week is going, what's next, whether a
 * timer is running, and how this account wants to be reminded. A wrist has no room for the buffer
 * category, so it isn't sent.
 */
export class WatchSummaryService {
  constructor(private readonly userId: string) {}

  async summary(weekStart: string | undefined, now = new Date()) {
    const week = resolveWeek(weekStart, now);

    const [data, resolved, active, preferences] = await Promise.all([
      new StatsRepository(this.userId).get(week.start, week.end),
      new CalendarEventsService(this.userId).resolve(now, addDays(now, LOOKAHEAD_DAYS)),
      new TrackingSessionsService(this.userId).current(),
      new PreferencesService(this.userId).get(),
    ]);

    const stats = categoryStatsCalculator.compute(data.categories, data.events, week);
    const ahead = eventsAhead(resolved.events, now, active?.eventId).slice(0, UPCOMING_LIMIT);
    const views = ahead.map((e) => nextEventView(e, now, data.categories));

    return {
      connected: data.connected,
      needsReconnect: data.needsReconnect,
      weekStart: week.start.toISOString(),
      now: now.toISOString(),
      categories: stats
        .filter((s) => !s.isBuffer)
        .map((s) => ({
          id: s.categoryId,
          name: s.name,
          color: s.color,
          icon: s.icon,
          targetHours: s.targetHours,
          actualHours: s.actualHours,
        })),
      // The first of the list and the list itself, because an older watch build only knows how to
      // read the one — and the two can never disagree about which event is next this way.
      nextEvent: views[0] ?? null,
      upcoming: views,
      active,
      // The watch reminds about `nextEvent` itself when no iPhone is there to do it, and it has
      // no other way to learn how far ahead this account wants to be told.
      reminders: {
        enabled: preferences.reminders.enabled,
        leadMinutes: preferences.reminders.leadMinutes,
        useCalendarReminders: preferences.reminders.useCalendarReminders,
      },
    };
  }
}

/**
 * Everything still to come, soonest first. A running session has an event of its own, and the
 * screen already shows it as the timer at the top — offering it again as "what's next" would be
 * the watch telling you about itself.
 */
function eventsAhead(events: readonly ResolvedEvent[], now: Date, activeEventId: string | undefined) {
  return events
    .filter(
      (e) =>
        !e.allDay && e.selfResponse !== "declined" && e.status !== "cancelled" && e.end > now && e.id !== activeEventId,
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function nextEventView(next: ResolvedEvent, now: Date, categories: readonly CategoryInput[]) {
  // The watch wears this as the event's glyph, so it wants the one category the event is
  // mostly about rather than the split it is actually mapped to.
  const categoryId = dominantCategoryId(next.weights);
  const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  return {
    id: next.id,
    calendarId: qualifyCalendarId(next.accountId, next.calendarId),
    title: next.title,
    start: next.start.toISOString(),
    end: next.end.toISOString(),
    inProgress: next.start <= now,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
    categoryIcon: category?.icon ?? null,
    // How a timer for it wants to be broken up — the watch offers to start one as the event
    // begins, and the rhythm is the event's own to say.
    timer: next.mapping?.timer ?? null,
    // The soonest popup reminder the calendar itself carries, so a watch reminding on its own
    // honours the event's own lead time the way every other screen does.
    reminderMinutes: popupMinutes(next.reminders),
  };
}

/** The soonest popup reminder on the event, in minutes, or null when it carries none. */
function popupMinutes(reminders: readonly EventReminder[]) {
  const popups = reminders.filter((reminder) => reminder.method === "popup");
  return popups.length > 0 ? Math.min(...popups.map((reminder) => reminder.minutes)) : null;
}

/**
 * The caller's week when it sent one, the server's week when it didn't. A watch sends its own
 * local Monday midnight as an instant, because "this week" is a question about where the person
 * is standing and this process runs in UTC; without one the server's week is only right by accident.
 */
function resolveWeek(weekStart: string | undefined, now: Date): Period {
  if (!weekStart) return periodResolver.resolve("week", now);
  const start = new Date(weekStart);
  if (Number.isNaN(start.getTime())) throw new ApiError("weekStart must be a valid ISO 8601 string");
  return { start, end: addDays(start, DAYS_PER_WEEK) };
}
