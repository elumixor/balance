import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { categories, trackingSessions } from "../../db/schema";
import { ApiError } from "../api-error";
import { ProviderNeedsReconnectError, ProviderNotConnectedError } from "../calendar/errors";
import { eventCache } from "../calendar/event-cache";
import { CalendarEventsService, qualifyCalendarId, type ResolvedEvent } from "../calendar/events-service";
import { EventMappingService } from "../calendar/mappings-service";
import { NEAR_START_MINUTES, rankMatches } from "./match";

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

/** A planned event a finished timer might have been for — see `match.ts`. */
export interface MatchCandidateDTO {
  readonly id: string;
  /** Qualified with the account it belongs to — see `qualifyCalendarId`. */
  readonly calendarId: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly categoryId: string | null;
  readonly score: number;
}

export interface StoppedSession {
  readonly stopped: TrackingSessionDTO;
  /** Best first; empty when the timer was already pointed at something planned. */
  readonly candidates: MatchCandidateDTO[];
}

/** How many planned events a wrist is offered after a timer. One is the answer; three is a menu. */
const MAX_CANDIDATES = 3;

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
    /** An event already in the calendar the timer is for — no new one is written. */
    eventId?: string;
    calendarId?: string;
  }): Promise<TrackingSessionDTO> {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, input.categoryId), eq(categories.userId, this.userId)),
    });
    if (!category) throw new ApiError("That category no longer exists", 404);
    if (category.archived) throw new ApiError("That category is archived");

    if (input.eventId) {
      if (!input.calendarId) throw new ApiError("An event needs its calendar");
      return this.startFor(category, input.calendarId, input.eventId, input.durationMinutes ?? null);
    }

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
   * A timer for something already planned — the reminder's "start timer" — runs against that
   * event rather than writing a second one beside it. The event has to count as something for
   * the hour to land anywhere, so an unmapped one is mapped to the category on the way in; one
   * already mapped keeps what it says. Somebody else's meeting is never re-timed.
   */
  private async startFor(
    category: CategoryRow,
    calendarId: string,
    eventId: string,
    durationMinutes: number | null,
  ): Promise<TrackingSessionDTO> {
    const target = await this.events.get(calendarId, eventId);
    if (target.weights.length === 0) {
      await new EventMappingService(this.userId).upsert({
        calendarId: target.calendarId,
        scope: "instance",
        externalEventId: target.id,
        weights: [{ categoryId: category.id, weightPercent: 100 }],
      });
      eventCache.invalidate(this.userId);
    }

    const startedAt = new Date();
    const plannedEndAt = durationMinutes
      ? new Date(startedAt.getTime() + durationMinutes * MS_PER_MINUTE)
      : target.end > startedAt
        ? target.end
        : null;
    if (plannedEndAt && plannedEndAt.getTime() - startedAt.getTime() < MIN_MINUTES * MS_PER_MINUTE) {
      throw new ApiError("A session has to run for at least a minute");
    }

    await this.stop();
    const [session] = await db
      .insert(trackingSessions)
      .values({
        userId: this.userId,
        categoryId: category.id,
        calendarId,
        externalEventId: target.id,
        startedAt,
        plannedEndAt,
        ownsEvent: this.isOwn(target),
        fromEvent: true,
      })
      .onConflictDoNothing()
      .returning();
    if (!session) throw new ApiError("A session is already running", 409);
    return this.toDTO(session, category);
  }

  /**
   * Ends the running session now, trimming its event to match. A calendar that has since been
   * disconnected doesn't strand the timer — the session is still closed, the event just keeps
   * whatever end it already had.
   *
   * What comes back with it is the question the wrist asks next: was this for something that was
   * already on the calendar? Only a timer that wrote its own event is asked — one started from a
   * reminder already knows — and a calendar that can't be read just answers with nothing to offer.
   */
  async stop(): Promise<StoppedSession | null> {
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

    const candidates = stopped.fromEvent ? [] : await this.candidates(stopped).catch(() => []);
    return { stopped: this.toDTO(stopped, category), candidates };
  }

  /**
   * The answer to "was this the one?": the timer's own event comes back out of the calendar, and
   * the planned one takes its place — re-timed to when the timer actually ran, when it is the
   * user's own to re-time, and mapped to the timer's category when it counted as nothing before.
   */
  async match(sessionId: string, calendarId: string, eventId: string): Promise<TrackingSessionDTO> {
    const session = await db.query.trackingSessions.findFirst({
      where: and(eq(trackingSessions.id, sessionId), eq(trackingSessions.userId, this.userId)),
      with: { category: true },
    });
    if (!session) throw new ApiError("That session no longer exists", 404);
    if (!session.endedAt) throw new ApiError("The session is still running");
    if (session.fromEvent) throw new ApiError("That session already belongs to a planned event");
    if (session.externalEventId === eventId) return this.toDTO(session, session.category);

    const target = await this.events.get(calendarId, eventId);
    const own = this.isOwn(target);
    if (own) await this.events.update(calendarId, target.id, { start: session.startedAt, end: session.endedAt });
    if (target.weights.length === 0) {
      await new EventMappingService(this.userId).upsert({
        calendarId: target.calendarId,
        scope: "instance",
        externalEventId: target.id,
        weights: [{ categoryId: session.categoryId, weightPercent: 100 }],
      });
    }
    await this.discard(session.calendarId, session.externalEventId);
    eventCache.invalidate(this.userId);

    const [matched] = await db
      .update(trackingSessions)
      .set({ calendarId, externalEventId: target.id, ownsEvent: own, fromEvent: true })
      .where(eq(trackingSessions.id, session.id))
      .returning();
    return this.toDTO(matched, session.category);
  }

  private async candidates(session: SessionRow): Promise<MatchCandidateDTO[]> {
    const end = session.endedAt ?? new Date();
    const margin = NEAR_START_MINUTES * MS_PER_MINUTE;
    const range = await this.events.resolve(
      new Date(session.startedAt.getTime() - margin),
      new Date(end.getTime() + margin),
    );
    const events = range.events
      .filter((e) => e.id !== session.externalEventId && e.countsTowardHours)
      .map((e) => ({ ...e, categoryId: dominant(e.weights) }));
    return rankMatches({ start: session.startedAt, end, categoryId: session.categoryId }, events)
      .slice(0, MAX_CANDIDATES)
      .map(({ event, score }) => ({
        id: event.id,
        calendarId: qualifyCalendarId(event.accountId, event.calendarId),
        title: event.title,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        categoryId: event.categoryId,
        score,
      }));
  }

  /** An event nobody else is on, and that the calendar lets us write — the only kind re-timed. */
  private isOwn(event: ResolvedEvent): boolean {
    return event.movable && event.attendees.every((a) => a.self || a.resource);
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
    if (!session.ownsEvent) return;
    try {
      await this.events.update(session.calendarId, session.externalEventId, { end });
    } catch (e) {
      if (e instanceof ProviderNotConnectedError || e instanceof ProviderNeedsReconnectError) return;
      if (e instanceof ApiError && (e.status === 403 || e.status === 404 || e.status === 410)) return;
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

/** The category an event counts most towards, or null when it counts towards nothing. */
function dominant(weights: readonly { categoryId: string; weightPercent: number }[]): string | null {
  return [...weights].sort((a, b) => b.weightPercent - a.weightPercent)[0]?.categoryId ?? null;
}
