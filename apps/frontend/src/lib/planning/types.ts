/**
 * What a session is made of, as the API answers it.
 *
 * Written out rather than inferred from the generated client: three screens and the notification
 * scheduler all read these, and a name is easier to follow across them than a path into a very
 * large generated type.
 */

export type Slot = "evening" | "morning" | "weekly";

export interface SessionBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  categoryId: string | null;
  categoryName: string | null;
  color: string | null;
  icon: string | null;
  hours: number;
}

export interface CategoryHours {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  hours: number;
  targetHours: number;
}

export interface DayView {
  day: string;
  planned: boolean;
  rest: boolean;
  /** 0..1 — how much of the day's budget has been given a meaning. */
  coverage: number;
  mappedHours: number;
  budgetHours: number;
  blocks: SessionBlock[];
}

export interface CopyPoint {
  text: string;
  /** The event it is about, so it can be drawn as a pill that opens it. */
  eventId: string | null;
}

export interface SessionCopy {
  title: string;
  body: string;
  points: CopyPoint[];
  generated: boolean;
}

export interface StarAward {
  reason: "daily" | "ahead" | "streak" | "missed" | "weekly" | "balance" | "schedule";
  delta: number;
}

export interface Rank {
  stars: number;
  tier: number;
  subtier: number;
  progress: number;
  progressOf: number;
  toNextSubtier: number;
}

export interface StarRates {
  daily: number;
  ahead: number;
  streak: number;
  streakFrom: number;
  missed: number;
  weekly: number;
  balanceBonusMax: number;
  scheduleBonusMax: number;
}

export interface WeekView {
  weekStart: string;
  categories: CategoryHours[];
  /** 0..1 — how closely the week followed the ring. */
  match: number;
  hours: number;
}

export interface SessionSummary {
  slot: Slot;
  today: string;
  timeZone: string;
  connected: boolean;
  needsReconnect: boolean;
  rank: Rank;
  streak: number;
  rates: StarRates;
  coverageThreshold: number;
  /** What committing the target day would pay right now. Empty once it has been committed. */
  award: StarAward[];
  weeklyAward: number;
  review: DayView & { hours: number; categories: CategoryHours[]; top: SessionBlock[] };
  target: DayView;
  week: WeekView | null;
  copy: SessionCopy;
}

export interface CommitResult {
  alreadyPlanned: boolean;
  awarded: StarAward[];
  stars: number;
}

export interface Achievement {
  id: string;
  label: string;
  detail: string;
  earned: boolean;
  /** 0..1 — how far along an unearned one is. */
  progress: number;
}

/** The record behind the star — see `server/lib/planning/progress.ts`. */
export interface StarProgress {
  rank: Rank;
  streak: number;
  bestStreak: number;
  plannedDays: number;
  aheadDays: number;
  restDays: number;
  weeksPlanned: number;
  weekStars: number;
  byReason: Record<string, number>;
  recent: { day: string; stars: number; planned: boolean; ahead: boolean; rest: boolean }[];
  achievements: Achievement[];
}

/** One session reminder, as the phone will schedule it. */
export interface SessionNotification {
  slot: Slot;
  day: string;
  at: string;
  title: string;
  body: string;
}
