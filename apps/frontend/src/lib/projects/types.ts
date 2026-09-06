/** A statement about the world. Holds no hours, ever — there is no field for them. */
export interface Goal {
  id: string;
  /** The sphere it belongs to — a category on the ring. */
  categoryId: string;
  statement: string;
  measure: string | null;
  /** `YYYY-MM-DD`, or null for "ongoing". */
  horizon: string | null;
}

/** Something recurring that never completes, measured only by whether it kept happening. */
export interface Practice {
  id: string;
  goalId: string | null;
  categoryId: string;
  name: string;
  unit: "times" | "hours";
  targetPerWeek: number;
}

export type ProjectStatus = "active" | "held" | "parked" | "shipped" | "killed";
export type ProjectTemplate = "build" | "search" | "delivery" | "exit" | "evergreen" | "simple";

export interface ProjectLink {
  label: string;
  url: string;
}

/** Bounded work that claims hours a week from a sphere and ends in a decision. */
export interface Project {
  id: string;
  goalId: string | null;
  categoryId: string;
  name: string;
  description: string;
  template: ProjectTemplate;
  hoursPerWeek: number;
  status: ProjectStatus;
  /** An emoji, or an image URL. Null falls back to the sphere's icon. */
  cover: string | null;
  links: ProjectLink[];
  people: string[];
  /** Delivery-type projects take an external date instead of deriving one. */
  deadline: string | null;
  unparkTrigger: string | null;
}

export type GateMetric = "days" | "people" | "throughput" | "event" | "hours";
export type StageOutcome = "ship" | "park" | "kill" | "restart";

export interface Checkpoint {
  day: string;
  count: number;
  moved: boolean;
  note: string;
}

/** One gate on the way through a project. The date is the server's, derived once and never edited. */
export interface Stage {
  id: string;
  projectId: string;
  ordinal: number;
  name: string;
  sentence: string;
  metric: GateMetric;
  threshold: number;
  windowDays: number;
  budgetHours: number;
  startedOn: string | null;
  decideOn: string | null;
  extendedOn: string | null;
  extensionNote: string | null;
  outcome: StageOutcome | null;
  decidedOn: string | null;
  decisionNote: string | null;
  checkpoints: Checkpoint[];
}

export interface Task {
  id: string;
  stageId: string;
  title: string;
  estimateHours: number | null;
  done: boolean;
  ordinal: number;
}

export type GateSource = "manual" | "product" | "timer";

/** One thing a gate counts that the calendar can't see. */
export interface GateEvent {
  id: string;
  stageId: string;
  day: string;
  source: GateSource;
  actorKey: string | null;
  note: string | null;
  quantity: number;
}

/** What a gate has counted so far — see `gates.ts` on the server. */
export interface GateProgress {
  count: number;
  threshold: number;
  windowStart: string;
  windowEnd: string;
  /** False until the window has opened: not measurable is not the same as failing. */
  measurable: boolean;
  passed: boolean;
}

export interface ProjectProgress {
  /** Hours logged per week, oldest first, this week last. Same length as `Progress.weeks`. */
  hoursByWeek: number[];
  stageId: string | null;
  gate: GateProgress | null;
}

export interface PracticeProgress {
  byWeek: number[];
  /** Kept over the last four whole weeks, as a share of the target. */
  adherence: number;
}

/** The calendar's answer to every project and practice at once — `/mobile/projects/progress`. */
export interface Progress {
  connected: boolean;
  needsReconnect: boolean;
  /** The Monday of each column, `YYYY-MM-DD`. */
  weeks: string[];
  projects: Record<string, ProjectProgress>;
  practices: Record<string, PracticeProgress>;
}

/** One answer to "A or B?" for two projects in the same sphere, on one dimension. */
export interface ProjectComparison {
  id: string;
  aId: string;
  bId: string;
  dimension: "priority" | "fun";
  winnerId: string;
}
