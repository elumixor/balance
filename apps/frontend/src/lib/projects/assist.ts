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

/** A calendar block worked out: what it serves, what is inside it, and how long it wants to be. */
export interface EventPlan {
  summary: string;
  question: { text: string; options: string[] } | null;
  projectId: string | null;
  taskId: string | null;
  steps: { title: string; estimateHours: number }[];
  brief: string;
  hours: number | null;
}

export interface DecisionAdvice {
  recommendation: "ship" | "extend" | "park" | "kill" | "restart" | "hold";
  why: string;
}

/** `available: false` is the whole answer when no model is configured or it is down. */
export type Assisted<T> = { available: true; suggestion: T } | { available: false; suggestion: null };
