import type { trackingSessions } from "~/db/schema";
import type { CalendarEventsService } from "~/lib/calendar/events-service";
import { qualifyCalendarId } from "~/lib/calendar/ids";
import { captureError } from "~/lib/telemetry";
import type { MatchCandidateDTO } from "./dto";
import { dominantCategoryId, NEAR_START_MINUTES, rankMatches } from "./match";

const MS_PER_MINUTE = 60_000;

/** How many planned events a wrist is offered after a timer. One is the answer; three is a menu. */
const MAX_CANDIDATES = 3;

type SessionRow = typeof trackingSessions.$inferSelect;

/**
 * The question the wrist asks after a timer: was this for something already on the calendar?
 * The pure scoring is `match.ts`; this reads the week around the session and puts the answer in
 * the shape the watch draws.
 */
export class SessionMatcher {
  constructor(
    private readonly userId: string,
    private readonly events: CalendarEventsService,
  ) {}

  /**
   * Best first. A calendar that can't be read answers with nothing to offer — the session is
   * already stopped, and a menu is not worth failing that over — but a read that fails is still
   * reported, or a dead grant would look like a quiet week.
   */
  async candidates(session: SessionRow): Promise<MatchCandidateDTO[]> {
    try {
      return await this.#rank(session);
    } catch (e) {
      await captureError(e, { userId: this.userId, path: "tracking/candidates" });
      return [];
    }
  }

  async #rank(session: SessionRow): Promise<MatchCandidateDTO[]> {
    const end = session.endedAt ?? new Date();
    const margin = NEAR_START_MINUTES * MS_PER_MINUTE;
    const range = await this.events.resolve(
      new Date(session.startedAt.getTime() - margin),
      new Date(end.getTime() + margin),
    );
    const events = range.events
      .filter((e) => e.id !== session.externalEventId && e.countsTowardHours)
      .map((e) => ({ ...e, categoryId: dominantCategoryId(e.weights) }));
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
}
