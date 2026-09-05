/**
 * What a star is worth, and what a total of them means.
 *
 * Pure arithmetic on purpose: this is the one place the rules exist, it is the thing most likely
 * to be tuned, and every number it produces ends up in front of the user as a promise — the panel
 * says "+3" before the day is committed and the ledger has to agree afterwards.
 *
 * The client never runs these. It is handed `StarRates` with the summary and renders a preview
 * from it, so a phone that is a version behind shows the rules the server will actually apply.
 */

/** Which rule paid. One payout per reason per day — the ledger's unique index says so. */
export type StarReason = "daily" | "ahead" | "streak" | "missed" | "weekly" | "balance" | "schedule";

/** Planning at all. */
export const DAILY_STARS = 1;
/** Planning tomorrow tonight rather than this morning — the whole point of the evening slot. */
export const AHEAD_STARS = 1;
/** From the third consecutive planned day on. */
export const STREAK_STARS = 1;
export const STREAK_FROM = 3;
/** A day that ended with no session at all. */
export const MISSED_STARS = -1;
/** The Sunday sitting, which costs fifteen minutes rather than two. */
export const WEEKLY_STARS = 5;

/** Living the week you drew: up to a quarter more on top of what the week already paid. */
export const BALANCE_BONUS_MAX = 0.25;
/** Living the day you drew, hour by hour. Smaller, because a day is noisier than a week. */
export const SCHEDULE_BONUS_MAX = 0.1;

/** Stars per subtier, and subtiers per tier: seven planned days is a subtier, five of those a tier. */
export const STARS_PER_SUBTIER = 7;
export const SUBTIERS_PER_TIER = 5;
export const STARS_PER_TIER = STARS_PER_SUBTIER * SUBTIERS_PER_TIER;

/** The rules as numbers, for a client that only has to draw them. */
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

export const STAR_RATES: StarRates = {
  daily: DAILY_STARS,
  ahead: AHEAD_STARS,
  streak: STREAK_STARS,
  streakFrom: STREAK_FROM,
  missed: MISSED_STARS,
  weekly: WEEKLY_STARS,
  balanceBonusMax: BALANCE_BONUS_MAX,
  scheduleBonusMax: SCHEDULE_BONUS_MAX,
};

export interface Award {
  reason: StarReason;
  delta: number;
}

/**
 * The morning's planning window closes at midday. A day planned after it is mostly behind you —
 * there is nothing to decide about a morning that has happened — so it is written down but pays
 * nothing, and nobody is asked for it.
 */
export const PLAN_UNTIL_MINUTES = 12 * 60;

/**
 * What committing a day pays, before the day has happened.
 *
 * `streak` is the number of planned days ending the day before this one, so committing the third
 * day in a row is the first one that earns the bonus. `late` is a same-day commit after the
 * morning window closed, which pays nothing at all.
 */
export function dailyAward(options: { ahead: boolean; streak: number; late?: boolean }): Award[] {
  if (options.late) return [];
  const awards: Award[] = [{ reason: "daily", delta: DAILY_STARS }];
  if (options.ahead) awards.push({ reason: "ahead", delta: AHEAD_STARS });
  if (options.streak + 1 >= STREAK_FROM) awards.push({ reason: "streak", delta: STREAK_STARS });
  return awards;
}

/**
 * The bonus for a day that went the way it was drawn, paid once the day is over.
 *
 * A fraction of what the day itself paid, so a bonus can't outweigh the thing it is a bonus on,
 * and rounded up — a day that matched at all should never be told it earned nothing.
 */
export function scheduleBonus(options: { earned: number; match: number }): Award | null {
  const delta = bonus(options.earned, options.match, SCHEDULE_BONUS_MAX);
  return delta > 0 ? { reason: "schedule", delta } : null;
}

/** The same, for a week measured against the ring rather than against its own blocks. */
export function balanceBonus(options: { earned: number; match: number }): Award | null {
  const delta = bonus(options.earned, options.match, BALANCE_BONUS_MAX);
  return delta > 0 ? { reason: "balance", delta } : null;
}

function bonus(earned: number, match: number, max: number) {
  if (earned <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, match));
  return Math.ceil(earned * clamped * max);
}

/**
 * The total after a change, with the two floors that keep it from being demoralising: stars never
 * go negative, and a tier once reached is never lost — a fortnight away can cost you subtiers,
 * which is a thing you can win back in a week, and not the month behind them.
 */
export function applyDelta(total: number, delta: number) {
  const floor = delta < 0 ? tierOf(total) * STARS_PER_TIER : 0;
  return Math.max(floor, total + delta);
}

export function tierOf(total: number) {
  return Math.floor(Math.max(0, total) / STARS_PER_TIER);
}

export function subtierOf(total: number) {
  return Math.floor((Math.max(0, total) % STARS_PER_TIER) / STARS_PER_SUBTIER);
}

/** Where the user is, and how far to the next line — everything the rank pill needs. */
export function rankOf(total: number) {
  const stars = Math.max(0, total);
  const into = stars % STARS_PER_SUBTIER;
  return {
    stars,
    tier: tierOf(stars),
    subtier: subtierOf(stars),
    /** Stars into the current subtier, and how many it takes to fill. */
    progress: into,
    progressOf: STARS_PER_SUBTIER,
    toNextSubtier: STARS_PER_SUBTIER - into,
  };
}
