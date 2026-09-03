/**
 * Fitting what an integration observed onto what the calendar already holds.
 *
 * An integration — Apple Health today — doesn't own the calendar; it contributes spans to it.
 * Each sync it says "these are the stretches I saw", and the calendar already has whatever the
 * last sync wrote, possibly moved since a watch synced its overnight data late. So the two lists
 * are matched by overlap: a span that overlaps an event this integration wrote earlier is that
 * event, updated if the edges moved; a span nothing overlaps is new; and an event of the
 * integration's that no span touches any more is left where it is — a feed that stops mentioning
 * a night is not evidence the night didn't happen.
 *
 * Only events carrying the integration's own `source` are candidates. A night somebody typed in
 * by hand is never adopted or moved, whatever it overlaps.
 */

export interface Span {
  readonly start: Date;
  readonly end: Date;
}

export interface OwnedEvent extends Span {
  readonly id: string;
  readonly calendarId: string;
}

export interface SpanPlan<E extends OwnedEvent> {
  /** Spans nothing the integration wrote overlaps. */
  readonly create: Span[];
  /** Existing events whose edges moved — a watch that synced the last hour of a night later. */
  readonly update: { event: E; start: Date; end: Date }[];
  /** Existing events the feed still describes, exactly as they are. */
  readonly unchanged: E[];
}

/**
 * Greedy by overlap: the best-overlapping pair is settled first, so a span straddling two old
 * events lands on the one it mostly is, and each event is claimed at most once.
 */
export function planSpans<E extends OwnedEvent>(observed: readonly Span[], owned: readonly E[]): SpanPlan<E> {
  const pairs: { span: Span; event: E; overlap: number }[] = [];
  for (const span of observed) {
    for (const event of owned) {
      const overlap = overlapMs(span, event);
      if (overlap > 0) pairs.push({ span, event, overlap });
    }
  }
  pairs.sort((a, b) => b.overlap - a.overlap);

  const claimedSpans = new Set<Span>();
  const claimedEvents = new Set<E>();
  const update: SpanPlan<E>["update"] = [];
  const unchanged: E[] = [];

  for (const { span, event } of pairs) {
    if (claimedSpans.has(span) || claimedEvents.has(event)) continue;
    claimedSpans.add(span);
    claimedEvents.add(event);
    if (sameInstant(span.start, event.start) && sameInstant(span.end, event.end)) unchanged.push(event);
    else update.push({ event, start: span.start, end: span.end });
  }

  return {
    create: observed.filter((span) => !claimedSpans.has(span)),
    update,
    unchanged,
  };
}

function overlapMs(a: Span, b: Span): number {
  return Math.min(a.end.getTime(), b.end.getTime()) - Math.max(a.start.getTime(), b.start.getTime());
}

/** Google keeps events to the second, so anything under one is the same time written twice. */
function sameInstant(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 1000;
}
