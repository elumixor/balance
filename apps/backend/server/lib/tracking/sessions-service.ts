import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { categories, trackingSessions } from "../../db/schema";
import { ApiError } from "../api-error";
import { ProviderNeedsReconnectError, ProviderNotConnectedError } from "../calendar/errors";
import { eventCache } from "../calendar/event-cache";
import { CalendarEventsService, qualifyCalendarId } from "../calendar/events-service";
import { EventMappingService } from "../calendar/mappings-service";

/** How long an open-ended session provisionally claims, so its event isn't zero-length. */
const PROVISIONAL_MINUTES = 30;

/** A session's event can never be shorter than this, or Google reads the patch as a move. */
const MIN_MINUTES = 1;

const MS_PER_MINUTE = 60_000;

/** The running session as every screen sees it, category already resolved. */
export interface TrackingSessionDTO {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
  readonly categoryIcon: string;
  readonly eventId: string;
  /** Qualified with the account it belongs to — see `qualifyCalendarId`. */
  readonly calendarId: string;
  readonly startedAt: string;
  readonly plannedEndAt: string | null;
}

type SessionRow = typeof trackingSessions.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

/**
 * Starting a timer from the watch is the same act as putting an event in the calendar — the
 * calendar stays the source of truth for the hours, and this service only owns the bookkeeping
 * around it: which category the timer was pointed at, and the fact that it is still running.
 *
 * Every write goes through the calendar first. An event that failed to be created leaves no
 * session behind, where the other order would leave a session pointing at nothing.
 */
export class TrackingSessionsService {
  private readonly events: CalendarEventsService;

  constructor(private readonly userId: string) {
    this.events = new CalendarEventsService(userId);
  }

  /** The session still running, or null. Never throws for a calendar that isn't connected. */
  async current(): Promise<TrackingSessionDTO | null> {
    const running = await this.running();
    if (!running) return null;
    return this.toDTO(running.session, running.category);
  }

  /**
   * A second start means the first one is over: the running session is stopped at this instant
   * rather than refused, which is what someone tapping a different category on their wrist means.
   *
   * The new event is written before the old session is closed, so a calendar that refuses the
   * write — an expired grant, a rate limit — leaves the timer that was already running alone
   * rather than cancelling it in exchange for nothing.
   */
  async start(input: {
    categoryId: string;
    durationMinutes?: number | null;
    title?: string;
  }): Promise<TrackingSessionDTO> {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, input.categoryId), eq(categories.userId, this.userId)),
    });
    if (!category) throw new ApiError("That category no longer exists", 404);
    if (category.archived) throw new ApiError("That category is archived");

    const startedAt = new Date();
    const minutes = input.durationMinutes ?? PROVISIONAL_MINUTES;
    if (minutes < MIN_MINUTES) throw new ApiError("A session has to run for at least a minute");
    const plannedEnd = new Date(startedAt.getTime() + minutes * MS_PER_MINUTE);

    const created = await this.events.create({
      start: startedAt,
      end: plannedEnd,
      title: input.title?.trim() || category.name,
    });
    const calendarId = qualifyCalendarId(created.accountId, created.calendarId);

    try {
      // The hour has to count as something, and a session is pointed at exactly one category, so
      // the event carries its own weights rather than borrowing an activity's mix.
      await new EventMappingService(this.userId).upsert({
        calendarId: created.calendarId,
        scope: "instance",
        externalEventId: created.id,
        weights: [{ categoryId: category.id, weightPercent: 100 }],
      });
      eventCache.invalidate(this.userId);

      await this.stop();

      // Two taps a moment apart — watch and phone, or one impatient finger — both get this far
      // with an event apiece. The partial unique index decides which of them is the session, and
      // the loser has to take its event back out of the calendar rather than leave the week
      // counting an hour no session owns.
      const [session] = await db
        .insert(trackingSessions)
        .values({
          userId: this.userId,
          categoryId: category.id,
          calendarId,
          externalEventId: created.id,
          startedAt,
          // An open-ended session's event has a provisional end, but nothing planned to hold on to.
          plannedEndAt: input.durationMinutes ? plannedEnd : null,
        })
        .onConflictDoNothing()
        .returning();
      if (!session) throw new ApiError("A session is already running", 409);

      return this.toDTO(session, category);
    } catch (e) {
      await this.discard(calendarId, created.id);
      throw e;
    }
  }

  /**
   * Ends the running session now, trimming its event to match. A calendar that has since been
   * disconnected doesn't strand the timer — the session is still closed, the event just keeps
   * whatever end it already had.
   */
  async stop(): Promise<TrackingSessionDTO | null> {
    const running = await this.running();
    if (!running) return null;
    const { session, category } = running;

    const endedAt = this.atLeastOneMinuteAfter(session.startedAt, new Date());
    await this.moveEnd(session, endedAt);

    const [stopped] = await db
      .update(trackingSessions)
      .set({ endedAt })
      .where(eq(trackingSessions.id, session.id))
      .returning();

    return this.toDTO(stopped, category);
  }

  /** Re-plans how long the running session plans to run, measured from when it started. */
  async extend(durationMinutes: number): Promise<TrackingSessionDTO> {
    const running = await this.running();
    if (!running) throw new ApiError("Nothing is being tracked right now", 404);
    const { session, category } = running;

    // Re-planning can shorten a session, but never to before this moment: the time already spent
    // has happened, and pulling the event's end into the past would quietly erase it.
    const requested = new Date(session.startedAt.getTime() + durationMinutes * MS_PER_MINUTE);
    const now = new Date();
    const plannedEndAt = this.atLeastOneMinuteAfter(session.startedAt, requested > now ? requested : now);
    await this.moveEnd(session, plannedEndAt);

    const [extended] = await db
      .update(trackingSessions)
      .set({ plannedEndAt })
      .where(eq(trackingSessions.id, session.id))
      .returning();

    return this.toDTO(extended, category);
  }

  private async running(): Promise<{ session: SessionRow; category: CategoryRow } | null> {
    const session = await db.query.trackingSessions.findFirst({
      where: and(eq(trackingSessions.userId, this.userId), isNull(trackingSessions.endedAt)),
      with: { category: true },
    });
    if (!session) return null;
    return { session, category: session.category };
  }

  /**
   * A disconnected grant, an expired one, or an event somebody deleted in Google are all states
   * the screens render rather than reasons to refuse to stop a timer — so the calendar half is
   * best-effort while the session's own end is not. Without this a session whose event went
   * missing could never be closed, and the partial unique index would block every later start.
   */
  private async moveEnd(session: SessionRow, end: Date): Promise<void> {
    try {
      await this.events.update(session.calendarId, session.externalEventId, { end });
    } catch (e) {
      if (e instanceof ProviderNotConnectedError || e instanceof ProviderNeedsReconnectError) return;
      if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
    eventCache.invalidate(this.userId);
  }

  /**
   * The event a losing start already put in the calendar, taken back out. Whatever went wrong
   * upstream is what the caller has to hear about, so a cleanup that fails as well stays quiet
   * rather than replacing the real error with a second one.
   */
  private async discard(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.events.delete(calendarId, eventId);
    } catch {
      eventCache.invalidate(this.userId);
    }
  }

  private atLeastOneMinuteAfter(start: Date, candidate: Date): Date {
    const floor = new Date(start.getTime() + MIN_MINUTES * MS_PER_MINUTE);
    return candidate > floor ? candidate : floor;
  }

  private toDTO(session: SessionRow, category: CategoryRow): TrackingSessionDTO {
    return {
      id: session.id,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
      eventId: session.externalEventId,
      calendarId: session.calendarId,
      startedAt: session.startedAt.toISOString(),
      plannedEndAt: session.plannedEndAt?.toISOString() ?? null,
    };
  }
}
