import { handler } from "@elumixor/nitro-client/server";
import { addDays } from "date-fns";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { CalendarEventsService, qualifyCalendarId } from "../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { PreferencesService } from "../../../../lib/preferences-service";
import { categoryStatsCalculator } from "../../../../lib/stats/category-stats";
import { periodResolver } from "../../../../lib/stats/period";
import { StatsRepository } from "../../../../lib/stats/queries";
import type { Period } from "../../../../lib/stats/types";
import { TrackingSessionsService } from "../../../../lib/tracking/sessions-service";

/** How far ahead "what's next" is worth looking. Past a fortnight, nothing is next any more. */
const LOOKAHEAD_DAYS = 14;

/**
 * Everything a watch face draws in one round trip: how this week is going, what's next, whether a
 * timer is running, and how this account wants to be reminded. A wrist has no room for the buffer category, so it isn't sent.
 *
 * The week is the caller's, not the server's: a watch sends its own local Monday midnight as an
 * instant, the same way the web app does, because "this week" is a question about where the person
 * is standing and this process runs in UTC. Without one we fall back to the server's week, which
 * is only ever right by accident.
 */
export default handler({ query: { weekStart: z.string().optional() } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const now = new Date();
    const week = resolveWeek(query.weekStart, now);

    const [data, upcoming, active, preferences] = await Promise.all([
      new StatsRepository(user.id).get(week.start, week.end),
      new CalendarEventsService(user.id).resolve(now, addDays(now, LOOKAHEAD_DAYS)),
      new TrackingSessionsService(user.id).current(),
      new PreferencesService(user.id).get(),
    ]);

    const stats = categoryStatsCalculator.compute(data.categories, data.events, week);
    // A running session has an event of its own, and the screen already shows it as the timer at
    // the top — offering it again as "what's next" would be the watch telling you about itself.
    const next = upcoming.events
      .filter(
        (e) =>
          !e.allDay &&
          e.selfResponse !== "declined" &&
          e.status !== "cancelled" &&
          e.end > now &&
          e.id !== active?.eventId,
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    const nextCategory = next ? dominantCategory(next.weights, data.categories) : undefined;

    // Per-user data behind a bearer token: no shared cache may ever hold it.
    setResponseHeader(event, "cache-control", "private, no-store");
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
      nextEvent: next
        ? {
            id: next.id,
            calendarId: qualifyCalendarId(next.accountId, next.calendarId),
            title: next.title,
            start: next.start.toISOString(),
            end: next.end.toISOString(),
            inProgress: next.start <= now,
            // The watch wears this as the event's glyph, so it wants the one category the event is
            // mostly about rather than the split it is actually mapped to.
            categoryId: nextCategory?.id ?? null,
            categoryName: nextCategory?.name ?? null,
            categoryColor: nextCategory?.color ?? null,
            categoryIcon: nextCategory?.icon ?? null,
            // How a timer for it wants to be broken up — the watch offers to start one as the
            // event begins, and the rhythm is the event's own to say.
            timer: next.mapping?.timer ?? null,
            // The soonest popup reminder the calendar itself carries, so a watch reminding on its
            // own honours the event's own lead time the way every other screen does.
            reminderMinutes: popupMinutes(next.reminders),
          }
        : null,
      active,
      // The watch reminds about `nextEvent` itself when no iPhone is there to do it, and it has
      // no other way to learn how far ahead this account wants to be told.
      reminders: {
        enabled: preferences.reminders.enabled,
        leadMinutes: preferences.reminders.leadMinutes,
        useCalendarReminders: preferences.reminders.useCalendarReminders,
      },
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});

/** The soonest popup reminder on the event, in minutes, or null when it carries none. */
function popupMinutes(reminders: readonly { method: string; minutes: number }[]) {
  const popups = reminders.filter((reminder) => reminder.method === "popup");
  return popups.length > 0 ? Math.min(...popups.map((reminder) => reminder.minutes)) : null;
}

/** The category an event counts most towards, or nothing when it counts towards none. */
function dominantCategory<T extends { id: string }>(
  weights: { categoryId: string; weightPercent: number }[],
  categories: T[],
): T | undefined {
  const heaviest = [...weights].sort((a, b) => b.weightPercent - a.weightPercent)[0];
  return heaviest ? categories.find((c) => c.id === heaviest.categoryId) : undefined;
}

/** The caller's week when it sent one, the server's week when it didn't. */
function resolveWeek(weekStart: string | undefined, now: Date): Period {
  if (!weekStart) return periodResolver.resolve("week", now);
  const start = new Date(weekStart);
  if (Number.isNaN(start.getTime())) throw new ApiError("weekStart must be a valid ISO 8601 string");
  return { start, end: addDays(start, 7) };
}
