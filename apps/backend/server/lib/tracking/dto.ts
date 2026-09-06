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
