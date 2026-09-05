import type { DayView } from "./types";

/** How many stars a day can wear on the review. */
export const DAY_STARS = 3;

/**
 * The day, as stars: three for a day kept to the bar, two for most of one, one for any hour that
 * was given a meaning. A rest day was a plan and was kept, so it wears all three.
 *
 * Nothing here can say "failed": an unlit star is a star not yet lit, and the caption beside it
 * only ever names what happened.
 */
export function dayRating(day: Pick<DayView, "coverage" | "rest">, threshold: number): number {
  if (day.rest) return DAY_STARS;
  if (day.coverage >= threshold) return DAY_STARS;
  if (day.coverage >= threshold / 2) return 2;
  return day.coverage > 0 ? 1 : 0;
}
