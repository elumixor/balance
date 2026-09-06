import type { GateMetric, ProjectTemplate } from "./types";

export interface GateProposal {
  sentence: string;
  metric: GateMetric;
  threshold: number;
  windowDays: number;
  countedBy: string;
}

export interface CreateSuggestion {
  kind: "project" | "recurring";
  reason: string;
  template: ProjectTemplate;
  hoursPerWeek: number;
  budgetHours: number;
  gates: GateProposal[];
}

export interface WeekNote {
  note: string;
  drop: { projectId: string; hours: number; why: string }[];
}

export interface CheckpointHelp {
  blocker: string;
  tasks: { title: string; estimateHours: number }[];
}

export interface DecisionAdvice {
  recommendation: "ship" | "extend" | "park" | "kill" | "restart" | "hold";
  why: string;
}

/** `available: false` is the whole answer when no model is configured or it is down. */
export type Assisted<T> = { available: true; suggestion: T } | { available: false; suggestion: null };
