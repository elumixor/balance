import type { Day } from "./days";

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

export interface DayView {
  day: Day;
  planned: boolean;
  rest: boolean;
  /** 0..1 — how much of the day's budget has been given a meaning. */
  coverage: number;
  mappedHours: number;
  budgetHours: number;
  blocks: SessionBlock[];
}

export interface CategoryHours {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  hours: number;
  targetHours: number;
}

/** A category as the planning views need it — the ring, without the database around it. */
export interface PlanCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetHoursPerWeek: number;
  isBuffer: boolean;
}
