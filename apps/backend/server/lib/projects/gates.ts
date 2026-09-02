import { addDays, type Day, daysBetween } from "../planning/days";

/** What a gate counts. The template offers a subset; the counting never changes. */
export type GateMetric = "days" | "people" | "throughput" | "event" | "hours";

/** One thing observed — a tagged block, a manual row, a ping — with what a metric might need of it. */
export interface Observation {
  readonly day: Day;
  /** Who or what, for distinct-people gates. */
  readonly key?: string | null;
  /** How much, for hours and throughput. Absent counts as one. */
  readonly quantity?: number;
}

export interface GateInput {
  readonly metric: GateMetric;
  readonly threshold: number;
  readonly windowDays: number;
  readonly decideOn: Day;
  readonly today: Day;
  readonly observations: readonly Observation[];
}

export interface GateProgress {
  readonly count: number;
  readonly threshold: number;
  readonly windowStart: Day;
  readonly windowEnd: Day;
  /**
   * False until the window has opened: a count of zero before then says nothing about the gate,
   * and a screen that drew it as failing would be lying.
   */
  readonly measurable: boolean;
  readonly passed: boolean;
}

/**
 * A gate is always a count in a window, compared to a threshold. The window is the last
 * `windowDays` before the decision, so a project that did all its work early still has to keep
 * it up to the day the decision is made — and one that finds its feet late still gets counted.
 */
export function gateProgress(input: GateInput): GateProgress {
  const windowEnd = input.decideOn;
  const windowStart = addDays(windowEnd, -input.windowDays);
  const measurable = daysBetween(windowStart, input.today) >= 0;
  const inWindow = input.observations.filter(
    (o) => daysBetween(windowStart, o.day) >= 0 && daysBetween(o.day, windowEnd) >= 0,
  );
  const count = measurable ? countOf(input.metric, inWindow) : 0;
  const threshold = input.metric === "event" ? 1 : input.threshold;
  return { count, threshold, windowStart, windowEnd, measurable, passed: measurable && count >= threshold };
}

function countOf(metric: GateMetric, observations: readonly Observation[]): number {
  switch (metric) {
    case "days":
      return new Set(observations.map((o) => o.day)).size;
    case "people":
      return new Set(observations.map((o) => o.key ?? "")).size;
    case "hours":
    case "throughput":
      return round(observations.reduce((sum, o) => sum + (o.quantity ?? 1), 0));
    case "event":
      return observations.length > 0 ? 1 : 0;
  }
}

/** Two decimals: hours arrive as fractions of an hour and nobody wants 3.3333333. */
function round(value: number) {
  return Math.round(value * 100) / 100;
}
