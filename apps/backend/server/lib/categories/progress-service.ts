import { CalendarEventsService } from "~/lib/calendar/events-service";
import { addDays, type Day, rangeOf, weekStartOf } from "~/lib/planning/days";
import { CategoryService } from "./service";
import { hoursBySphere, parentsOf, progressOf, type SphereProgress } from "./tree";

export interface WeekProgress {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  /** The Monday of the week measured, as the person's own day. */
  readonly weekStart: Day;
  readonly spheres: SphereProgress[];
}

/**
 * How the week containing `day` is going for each sphere and each project under one: what has
 * been spent, what is still on the calendar, and what the target leaves. Read through the same
 * `CalendarEventsService.resolve` as every screen, so it can't disagree with the ring.
 */
export class SphereProgressService {
  constructor(private readonly userId: string) {}

  async week(day: Day, timeZone: string, now = new Date()): Promise<WeekProgress> {
    const weekStart = weekStartOf(day);
    const window = { start: rangeOf(weekStart, timeZone).start, end: rangeOf(addDays(weekStart, 6), timeZone).end };
    const [rows, range] = await Promise.all([
      new CategoryService(this.userId).list(),
      new CalendarEventsService(this.userId).resolve(window.start, window.end),
    ]);
    const spheres = rows.map((row) => ({ ...row, targetHoursPerWeek: Number(row.targetHoursPerWeek) }));
    const blocks = range.events
      .filter((event) => event.countsTowardHours && event.weights.length > 0)
      .map((event) => ({ start: event.start.getTime(), end: event.end.getTime(), weights: event.weights }));
    const hours = hoursBySphere(
      blocks,
      { start: window.start.getTime(), end: window.end.getTime() },
      now.getTime(),
      parentsOf(spheres),
    );
    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      weekStart,
      spheres: progressOf(spheres, hours),
    };
  }
}
