import { CalendarEventsService, qualifyCalendarId, type ResolvedEvent } from "../calendar/events-service";
import type { ActivityWeightInput } from "../categories-service";
import { type OwnedEvent, planSpans, type Span } from "./spans";

/** What one sync from an integration is: the spans it saw, and what to write them as. */
export interface SpanSyncInput {
  /** The integration's name — what its events are stamped with, and all it may touch. */
  readonly source: string;
  /** The window the spans were read from; only the integration's events inside it are candidates. */
  readonly from: Date;
  readonly to: Date;
  readonly spans: readonly Span[];
  readonly title: string;
  /** The category the hours count as. */
  readonly categoryId: string;
  /** Where new events land; the account's write calendar when absent. */
  readonly calendarId?: string;
}

export interface SpanSyncResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
}

/**
 * The write half of an integration: reads the window through the one read path, works out with
 * `planSpans` what is new and what moved, and writes only that. The category is applied at
 * creation and never again, so re-tagging a synced night by hand sticks.
 */
export class SpanSyncService {
  constructor(private readonly userId: string) {}

  async sync(input: SpanSyncInput): Promise<SpanSyncResult> {
    const events = new CalendarEventsService(this.userId);
    const range = await events.resolve(input.from, input.to);
    const owned = range.events
      .filter((event) => event.mapping?.source === input.source && !event.allDay)
      .map((event) => toOwned(event));

    const plan = planSpans(input.spans, owned);
    const weights: ActivityWeightInput[] = [{ categoryId: input.categoryId, weightPercent: 100 }];

    for (const change of plan.update) {
      await events.update(change.event.calendarId, change.event.id, { start: change.start, end: change.end });
    }
    for (const span of plan.create) {
      await events.create({
        title: input.title,
        weights,
        source: input.source,
        start: span.start,
        end: span.end,
        calendarId: input.calendarId,
      });
    }

    return { created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged.length };
  }
}

function toOwned(event: ResolvedEvent): OwnedEvent {
  return {
    id: event.id,
    calendarId: qualifyCalendarId(event.accountId, event.calendarId),
    start: event.start,
    end: event.end,
  };
}
