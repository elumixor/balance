/**
 * Which planned event a finished timer was probably for.
 *
 * A timer started from the wrist writes an event of its own, and most of the time that is the
 * whole story. But a week already has things in it: the hour blocked out for the gym is still on
 * the calendar when the timer run in the gym ends, and counting both would be an hour and a half
 * of exercise for forty minutes of it. So when a session ends, the events it ran alongside are
 * scored, and the best one is offered back as "was this the one?".
 */

const MS_PER_MINUTE = 60_000;

/** How far from the session's start a planned event may begin and still be a candidate. */
export const NEAR_START_MINUTES = 30;

/** Scores below this are noise — an event that merely brushed the session's window. */
const MIN_SCORE = 0.2;

export interface Weight {
  readonly categoryId: string;
  readonly weightPercent: number;
}

/** The category an event counts most towards, or null when it counts towards nothing. */
export function dominantCategoryId(weights: readonly Weight[]): string | null {
  return [...weights].sort((a, b) => b.weightPercent - a.weightPercent)[0]?.categoryId ?? null;
}

export interface MatchWindow {
  readonly start: Date;
  readonly end: Date;
  readonly categoryId: string;
}

export interface MatchableEvent {
  readonly id: string;
  readonly start: Date;
  readonly end: Date;
  /** The category the event counts most towards, or null when it counts towards nothing. */
  readonly categoryId: string | null;
}

export interface ScoredMatch<T extends MatchableEvent> {
  readonly event: T;
  /** 0–1: how convincingly this event is what the session was. */
  readonly score: number;
}

/**
 * Candidates in descending order of likelihood. The score is mostly how much of the two spans
 * overlap, with a nod to an event counting as the same thing and a small one to an event that
 * counts as nothing yet — which is the kind of block a finished timer most often explains.
 */
export function rankMatches<T extends MatchableEvent>(window: MatchWindow, events: readonly T[]): ScoredMatch<T>[] {
  return events
    .map((event) => ({ event, score: score(window, event) }))
    .filter((match) => match.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

function score(window: MatchWindow, event: MatchableEvent): number {
  const sessionMs = window.end.getTime() - window.start.getTime();
  const eventMs = event.end.getTime() - event.start.getTime();
  if (sessionMs <= 0 || eventMs <= 0) return 0;

  const overlapMs = Math.max(
    0,
    Math.min(window.end.getTime(), event.end.getTime()) - Math.max(window.start.getTime(), event.start.getTime()),
  );
  const startGapMinutes = Math.abs(event.start.getTime() - window.start.getTime()) / MS_PER_MINUTE;
  if (overlapMs === 0 && startGapMinutes > NEAR_START_MINUTES) return 0;

  // Overlap against the longer of the two, so a two-minute timer inside a two-hour block is a
  // weak match rather than a perfect one.
  const overlap = overlapMs / Math.max(sessionMs, eventMs);
  // An event that started near the timer did, even if the two barely touch.
  const nearness = Math.max(0, 1 - startGapMinutes / NEAR_START_MINUTES);
  const sameCategory = event.categoryId === window.categoryId ? 0.25 : 0;
  const unclaimed = event.categoryId === null ? 0.1 : 0;

  return Math.min(1, overlap * 0.6 + nearness * 0.3 + sameCategory + unclaimed);
}
