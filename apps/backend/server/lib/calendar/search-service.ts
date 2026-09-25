import { qualifyCalendarId } from "./ids";
import { calendarConnections } from "./registry";
import { visibleCalendarIds } from "./write-target";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** A year back and a year on: what somebody remembers well enough to type a word of. */
const SPAN_DAYS = 365;
/** A palette shows a handful; more than this is a list, and the calendar itself is a better one. */
export const SEARCH_LIMIT = 12;

/** One hit: enough to draw a row and to open the event on the week it belongs to. */
export interface EventHit {
  readonly id: string;
  readonly calendarId: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly location: string | null;
}

/**
 * The calendar's answer to a few typed words. Not `resolve`: a search result is a row to jump to,
 * with no mapping, no record and no travel time on it, and the week it opens on reads all of that
 * through the one path everything else does. A revoked account is skipped, never an error.
 */
export class CalendarSearchService {
  constructor(private readonly userId: string) {}

  async search(text: string): Promise<EventHit[]> {
    const active = (await calendarConnections(this.userId)).filter((c) => !c.account.revokedAt);
    const now = Date.now();
    const from = new Date(now - SPAN_DAYS * MS_PER_DAY);
    const to = new Date(now + SPAN_DAYS * MS_PER_DAY);

    const perAccount = await Promise.all(
      active.map(async (connection) => {
        const events = await connection.provider.searchEvents(
          visibleCalendarIds(connection),
          text,
          from,
          to,
          SEARCH_LIMIT,
        );
        return events.map(
          (event): EventHit => ({
            id: event.id,
            calendarId: qualifyCalendarId(connection.accountId, event.calendarId),
            title: event.title,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            allDay: event.allDay,
            location: event.location,
          }),
        );
      }),
    );

    // Nearest to today first: the meeting last week is more likely the one meant than one last year.
    return perAccount
      .flat()
      .sort((a, b) => Math.abs(Date.parse(a.start) - now) - Math.abs(Date.parse(b.start) - now))
      .slice(0, SEARCH_LIMIT);
  }
}
