// Shared types for the Statistics screen's calculations.
// No DB access here — everything takes plain data in and returns plain data out.

export type PeriodKind = "day" | "week" | "month" | "custom";
export type BalanceStatus = "over" | "under" | "on-target";

export interface Period {
  /** inclusive */
  start: Date;
  /** exclusive */
  end: Date;
}

export interface WeightInput {
  categoryId: string;
  weightPercent: number;
}

/** A calendar event, with what it counts as already resolved by the calendar layer. */
export interface EventInput {
  id: string;
  startedAt: Date;
  endedAt: Date;
  weights: WeightInput[];
  /** What the breakdown list calls this time — the mapped activity, or the event itself. */
  source: { id: string; name: string };
}

export interface CategoryInput {
  id: string;
  name: string;
  color: string;
  targetHoursPerWeek: number;
}

export interface CategoryBreakdownItem {
  activityId: string;
  activityName: string;
  hours: number;
}

export interface CategoryStat {
  categoryId: string;
  name: string;
  color: string;
  targetHours: number;
  actualHours: number;
  diffHours: number;
  diffPercent: number;
  status: BalanceStatus;
  breakdown: CategoryBreakdownItem[];
}

export interface TrendPoint {
  period: Period;
  actualHours: number;
  targetHours: number;
}

export interface CategoryTrend {
  categoryId: string;
  name: string;
  color: string;
  /** oldest first, current period last */
  points: TrendPoint[];
}

export const MS_PER_HOUR = 1000 * 60 * 60;
export const MS_PER_DAY = 1000 * 60 * 60 * 24;
