export interface Category {
  id: string;
  name: string;
  color: string;
  targetHoursPerWeek: number;
  isBuffer: boolean;
  archived: boolean;
}

export interface ActivityWeight {
  categoryId: string;
  weightPercent: number;
}

export interface Activity {
  id: string;
  name: string;
  archived: boolean;
  weights: ActivityWeight[];
}

export interface Entry {
  id: string;
  activityId: string;
  activityName: string;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
}

export interface ActivityRef {
  id: string;
  name: string;
}

export interface TrackData {
  entries: Entry[];
  recentActivities: ActivityRef[];
  frequentActivities: ActivityRef[];
}

export type BalanceStatus = "over" | "under" | "on-target";

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
  periodStart: string;
  periodEnd: string;
  actualHours: number;
  targetHours: number;
}

export interface CategoryTrend {
  categoryId: string;
  name: string;
  color: string;
  points: TrendPoint[];
}

export interface StatsResponse {
  period: { start: string; end: string; kind: string };
  categories: CategoryStat[];
  trends: CategoryTrend[];
  trendPeriodCount: number;
}

/** A stacked-bar slice: an activity's share of one category. */
export type Split = { id: string; color: string; value: number };

export type RingSegment = {
  id: string;
  label: string;
  color: string;
  /** Values share one unit; the ring maps their sum onto 360°. */
  value: number;
};

export type BalanceSlice = {
  id: string;
  label: string;
  color: string;
  targetHours: number;
  actualHours: number;
};
