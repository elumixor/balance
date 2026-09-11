import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db";
import { categories, trackingSessions } from "~/db/schema";
import { ProviderNeedsReconnectError, ProviderNotConnectedError } from "~/lib/calendar/errors";
import { eventCache } from "~/lib/calendar/event-cache";
import { CalendarEventsService, type ResolvedEvent } from "~/lib/calendar/events-service";
import { qualifyCalendarId } from "~/lib/calendar/ids";
import { EventMappingService } from "~/lib/calendar/mappings-service";
import { ApiError, ConflictError, NotFoundError } from "~/lib/http/api-error";
import { captureError } from "~/lib/telemetry";
import type { StoppedSession, TrackingSessionDTO } from "./dto";
import { SessionMatcher } from "./matcher";

/** How long an open-ended session provisionally claims, so its event isn't zero-length. */
const PROVISIONAL_MINUTES = 30;

/** A session's event can never be shorter than this, or Google reads the patch as a move. */
const MIN_MINUTES = 1;

const MS_PER_MINUTE = 60_000;

/**
 * How far back a session is allowed to say it began. A watch that has been offline for longer
 * than this is likelier to be carrying a wrong clock than a genuinely week-old timer, and a
 * calendar event written into last month is worse than one written into this hour.
 */
const BACKDATE_LIMIT_MS = 7 * 24 * 60 * MS_PER_MINUTE;

/** Google's answers that mean the event is not ours to move any more — see `moveEnd`. */
const EVENT_GONE_STATUSES = new Set([403, 404, 410]);

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
  readonly #events: CalendarEventsService;
  readonly #mappings: EventMappingService;
  readonly #matcher: SessionMatcher;

  constructor(private readonly userId: string) {
    this.#events = new CalendarEventsService(userId);
    this.#mappings = new EventMappingService(userId);
    this.#matcher = new SessionMatcher(userId, this.#events);
  }

  /** The session still running, or null. Never throws for a calendar that isn't connected. */
  async current(): Promise<TrackingSessionDTO | null> {
    const running = await this.#running();
    if (!running) return null;
    return this.#toDTO(running.session, running.category);
  }

  /**
   * A second start means the first one is over: the running session is stopped at this instant
   * rather than refused, which is what someone tapping a different category on their wrist means.
   * It is stopped first, so that the new event never sits beside a still-open one; a calendar
   * that then refuses the new event leaves a closed timer and nothing dangling.
   */
  async start(input: {
    categoryId: string;
    durationMinutes?: number | null;
    title?: string;
    /** An event already in the calendar the timer is for — no new one is written. */
    eventId?: string;
    calendarId?: string;
    /**
     * When the timer actually began, for one that was started while the wrist had no network and
     * is only now being told about. Never in the future, and never further back than
     * `BACKDATE_LIMIT_MS`, because a clock that is wrong is likelier than a timer that old.
     */
    startedAt?: Date;
  }): Promise<TrackingSessionDTO> {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, input.categoryId), eq(categories.userId, this.userId)),
    });
    if (!category) throw new NotFoundError("That category no longer exists");
    if (category.archived) throw new ApiError("That category is archived");

    if (input.eventId) {
      if (!input.calendarId) throw new ApiError("An event needs its calendar");
      return this.#startFor(category, input.calendarId, input.eventId, input.durationMinutes ?? null);
    }

    const startedAt = backdated(input.startedAt);
    const minutes = input.durationMinutes ?? PROVISIONAL_MINUTES;
    if (minutes < MIN_MINUTES) throw new ApiError("A session has to run for at least a minute");
    const plannedEnd = new Date(startedAt.getTime() + minutes * MS_PER_MINUTE);

    await this.stop();

    const created = await this.#events.create({
      start: startedAt,
      end: plannedEnd,
      title: input.title?.trim() || category.name,
    });
    const calendarId = qualifyCalendarId(created.accountId, created.calendarId);

    try {
      // The hour has to count as something, and a session is pointed at exactly one category, so
      // the event carries its own weights rather than borrowing an activity's mix.
      await this.#mappings.upsert({
        calendarId: created.calendarId,
        scope: "instance",
        externalEventId: created.id,
        weights: [{ categoryId: category.id, weightPercent: 100 }],
      });

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
      if (!session) throw new ConflictError("A session is already running");

      return this.#toDTO(session, category);
    } catch (e) {
      await this.#discard(calendarId, created.id);
      throw e;
    }
  }

  /**
   * A timer for something already planned — the reminder's "start timer" — runs against that
   * event rather than writing a second one beside it. The event has to count as something for
   * the hour to land anywhere, so an unmapped one is mapped to the category on the way in; one
   * already mapped keeps what it says. Somebody else's meeting is never re-timed.
   */
  async #startFor(
    category: CategoryRow,
    calendarId: string,
    eventId: string,
    durationMinutes: number | null,
  ): Promise<TrackingSessionDTO> {
    const target = await this.#events.get(calendarId, eventId);
    if (target.weights.length === 0) {
      await this.#mappings.upsert({
        calendarId: target.calendarId,
        scope: "instance",
        externalEventId: target.id,
        weights: [{ categoryId: category.id, weightPercent: 100 }],
      });
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
        ownsEvent: isOwn(target),
        fromEvent: true,
      })
      .onConflictDoNothing()
      .returning();
    if (!session) throw new ConflictError("A session is already running");
    return this.#toDTO(session, category);
  }

  /**
   * Ends the running session now, trimming its event to match. A calendar that has since been
   * disconnected doesn't strand the timer — the session is still closed, the event just keeps
   * whatever end it already had.
   *
   * What comes back with it is the question the wrist asks next: was this for something that was
   * already on the calendar? Only a timer that wrote its own event is asked — one started from a
   * reminder already knows.
   */
  async stop(at?: Date): Promise<StoppedSession | null> {
    const running = await this.#running();
    if (!running) return null;
    const { session, category } = running;

    // `at` is for a watch that stopped a timer with no signal and is only now able to say so;
    // without it the hours would grow by however long it stayed offline. A moment in the future
    // is this one, for the same reason a backdated start is.
    const now = new Date();
    const requested = at && at < now ? at : now;
    const endedAt = atLeastOneMinuteAfter(session.startedAt, requested);
    await this.#moveEnd(session, endedAt);

    const [stopped] = await db
      .update(trackingSessions)
      .set({ endedAt })
      .where(eq(trackingSessions.id, session.id))
      .returning();

    const candidates = stopped.fromEvent ? [] : await this.#matcher.candidates(stopped);
    return { stopped: this.#toDTO(stopped, category), candidates };
  }

  /**
   * A timer that ran and finished while the wrist had no network, written down after the fact.
   *
   * It is a start and a stop in one call rather than the two replayed in order: by the time the
   * watch can reach the server the session is over, and replaying a start would leave a running
   * timer on every other screen for as long as the stop took to follow. The event is written for
   * the span it actually ran, so the week reads the same as if the watch had been online.
   *
   * Nothing here is asked about matching a planned event: that question was already asked and
   * answered on the wrist while it was offline, or it was never going to be.
   */
  async log(input: {
    categoryId: string;
    startedAt: Date;
    endedAt: Date;
    title?: string;
  }): Promise<TrackingSessionDTO> {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, input.categoryId), eq(categories.userId, this.userId)),
    });
    if (!category) throw new NotFoundError("That category no longer exists");

    const startedAt = backdated(input.startedAt);
    const endedAt = atLeastOneMinuteAfter(startedAt, input.endedAt > new Date() ? new Date() : input.endedAt);

    const created = await this.#events.create({
      start: startedAt,
      end: endedAt,
      title: input.title?.trim() || category.name,
    });
    const calendarId = qualifyCalendarId(created.accountId, created.calendarId);

    try {
      await this.#mappings.upsert({
        calendarId: created.calendarId,
        scope: "instance",
        externalEventId: created.id,
        weights: [{ categoryId: category.id, weightPercent: 100 }],
      });

      // Already closed as it goes in, so the partial unique index on the running session never
      // sees it and a timer running right now — on the phone, say — is left alone.
      const [session] = await db
        .insert(trackingSessions)
        .values({
          userId: this.userId,
          categoryId: category.id,
          calendarId,
          externalEventId: created.id,
          startedAt,
          plannedEndAt: endedAt,
          endedAt,
        })
        .returning();

      return this.#toDTO(session, category);
    } catch (e) {
      await this.#discard(calendarId, created.id);
      throw e;
    }
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
    if (!session) throw new NotFoundError("That session no longer exists");
    if (!session.endedAt) throw new ApiError("The session is still running");
    if (session.fromEvent) throw new ApiError("That session already belongs to a planned event");
    if (session.externalEventId === eventId) return this.#toDTO(session, session.category);

    const target = await this.#events.get(calendarId, eventId);
    const own = isOwn(target);
    if (own) await this.#events.update(calendarId, target.id, { start: session.startedAt, end: session.endedAt });
    if (target.weights.length === 0) {
      await this.#mappings.upsert({
        calendarId: target.calendarId,
        scope: "instance",
        externalEventId: target.id,
        weights: [{ categoryId: session.categoryId, weightPercent: 100 }],
      });
    }
    await this.#discard(session.calendarId, session.externalEventId);

    const [matched] = await db
      .update(trackingSessions)
      .set({ calendarId, externalEventId: target.id, ownsEvent: own, fromEvent: true })
      .where(eq(trackingSessions.id, session.id))
      .returning();
    return this.#toDTO(matched, session.category);
  }

  /** Re-plans how long the running session plans to run, measured from when it started. */
  async extend(durationMinutes: number): Promise<TrackingSessionDTO> {
    const running = await this.#running();
    if (!running) throw new NotFoundError("Nothing is being tracked right now");
    const { session, category } = running;

    // Re-planning can shorten a session, but never to before this moment: the time already spent
    // has happened, and pulling the event's end into the past would quietly erase it.
    const requested = new Date(session.startedAt.getTime() + durationMinutes * MS_PER_MINUTE);
    const now = new Date();
    const plannedEndAt = atLeastOneMinuteAfter(session.startedAt, requested > now ? requested : now);
    await this.#moveEnd(session, plannedEndAt);

    const [extended] = await db
      .update(trackingSessions)
      .set({ plannedEndAt })
      .where(eq(trackingSessions.id, session.id))
      .returning();

    return this.#toDTO(extended, category);
  }

  async #running(): Promise<{ session: SessionRow; category: CategoryRow } | null> {
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
  async #moveEnd(session: SessionRow, end: Date): Promise<void> {
    if (!session.ownsEvent) return;
    try {
      await this.#events.update(session.calendarId, session.externalEventId, { end });
    } catch (e) {
      if (e instanceof ProviderNotConnectedError || e instanceof ProviderNeedsReconnectError) return;
      if (e instanceof ApiError && EVENT_GONE_STATUSES.has(e.status)) return;
      throw e;
    }
  }

  /**
   * The event a losing start already put in the calendar, taken back out. Whatever went wrong
   * upstream is what the caller has to hear about, so a cleanup that fails as well is reported
   * rather than thrown — a second error would replace the real one — and the week is forgotten
   * either way, since the event may or may not still be in it.
   */
  async #discard(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.#events.delete(calendarId, eventId);
    } catch (e) {
      await captureError(e, { userId: this.userId, path: "tracking/discard" });
      eventCache.invalidate(this.userId);
    }
  }

  #toDTO(session: SessionRow, category: CategoryRow): TrackingSessionDTO {
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

/** An event nobody else is on, and that the calendar lets us write — the only kind re-timed. */
function isOwn(event: ResolvedEvent): boolean {
  return event.movable && event.attendees.every((a) => a.self || a.resource);
}

function atLeastOneMinuteAfter(start: Date, candidate: Date): Date {
  const floor = new Date(start.getTime() + MIN_MINUTES * MS_PER_MINUTE);
  return candidate > floor ? candidate : floor;
}

/**
 * When a caller says a timer began. Absent is now; a moment in the future is now, because a clock
 * running fast must not write the week ahead; anything older than the limit is refused rather than
 * quietly moved, since silently logging the wrong hours is the one outcome nobody can spot.
 */
function backdated(startedAt: Date | undefined): Date {
  const now = new Date();
  if (!startedAt) return now;
  if (startedAt > now) return now;
  if (now.getTime() - startedAt.getTime() > BACKDATE_LIMIT_MS) {
    throw new ApiError("That timer is too old to be recorded");
  }
  return startedAt;
}
