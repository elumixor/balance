/** A stretch of time, in epoch milliseconds. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * How much of each span is its own once overlaps are shared: wherever several run at once, each
 * is credited an equal part of that stretch. An hour-long meeting with a call in its last half
 * hour is 45 minutes of meeting and 15 of call — two things done at once are not two hours done.
 *
 * Answers milliseconds per span, in the order given, clipped to `window` when there is one. The
 * credits always add up to the time covered by at least one span, never more.
 */
export function sharedDurations(spans: readonly Span[], window?: Span): number[] {
  const clipped = spans.map((span) => ({
    start: window ? Math.max(span.start, window.start) : span.start,
    end: window ? Math.min(span.end, window.end) : span.end,
  }));
  const credits = clipped.map(() => 0);
  const edges = [...new Set(clipped.filter((s) => s.end > s.start).flatMap((s) => [s.start, s.end]))].sort(
    (a, b) => a - b,
  );

  for (let i = 0; i + 1 < edges.length; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    const running = clipped.flatMap((span, index) => (span.start <= from && span.end >= to ? [index] : []));
    for (const index of running) credits[index] += (to - from) / running.length;
  }
  return credits;
}
