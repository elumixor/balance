import type { GateMetric, ProjectStatus, ProjectTemplate, Stage } from "$lib/types";

/** The starting shape of one stage — what a template fills in, all of it editable afterwards. */
export type StageTemplate = Pick<Stage, "name" | "sentence" | "metric" | "threshold" | "windowDays" | "budgetHours">;

export interface Template {
  readonly key: ProjectTemplate;
  readonly label: string;
  /** The shape in a few words, for the picker. */
  readonly shape: string;
  readonly stages: readonly StageTemplate[];
  /** Where the decision date comes from. */
  readonly dated: "derived" | "deadline" | "none";
  /** Which flavours of gate this lifecycle offers. The counting itself never changes. */
  readonly metrics: readonly GateMetric[];
}

const WEEK = 7;
const FORTNIGHT = 14;

/**
 * A lifecycle is a row here, not a branch in the engine: every template is stages with gates,
 * and a gate is always a count in a window. A new kind of project is a new row. If one ever
 * needs different date or outcome behaviour, the abstraction is wrong, not the table.
 */
export const TEMPLATES: readonly Template[] = [
  {
    key: "simple",
    label: "Simple",
    shape: "One gate, one date",
    dated: "derived",
    metrics: ["days", "throughput", "event", "hours"],
    stages: [{ name: "Do it", sentence: "", metric: "days", threshold: 7, windowDays: FORTNIGHT, budgetHours: 10 }],
  },
  {
    key: "build",
    label: "Build",
    shape: "My tool → other people → product",
    dated: "derived",
    metrics: ["days", "people", "throughput", "hours"],
    stages: [
      {
        name: "My tool",
        sentence: "I use it myself on ten days out of fourteen",
        metric: "days",
        threshold: 10,
        windowDays: FORTNIGHT,
        budgetHours: 40,
      },
      {
        name: "Other people",
        sentence: "Three people other than me use it in one week",
        metric: "people",
        threshold: 3,
        windowDays: WEEK,
        budgetHours: 40,
      },
      {
        name: "Product",
        sentence: "Ten people use it in one week",
        metric: "people",
        threshold: 10,
        windowDays: WEEK,
        budgetHours: 80,
      },
    ],
  },
  {
    key: "search",
    label: "Search",
    shape: "Prep → outreach → pipeline → offer",
    dated: "derived",
    metrics: ["throughput", "event", "days"],
    stages: [
      {
        name: "Prep",
        sentence: "CV and portfolio sent to one person for review",
        metric: "event",
        threshold: 1,
        windowDays: FORTNIGHT,
        budgetHours: 10,
      },
      {
        name: "Outreach",
        sentence: "Twenty applications sent in two weeks",
        metric: "throughput",
        threshold: 20,
        windowDays: FORTNIGHT,
        budgetHours: 20,
      },
      {
        name: "Pipeline",
        sentence: "Five first conversations held in two weeks",
        metric: "throughput",
        threshold: 5,
        windowDays: FORTNIGHT,
        budgetHours: 20,
      },
      {
        name: "Offer",
        sentence: "Two final rounds done in two weeks",
        metric: "throughput",
        threshold: 2,
        windowDays: FORTNIGHT,
        budgetHours: 20,
      },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    shape: "One stage, somebody else's deadline",
    dated: "deadline",
    metrics: ["event", "hours"],
    stages: [
      {
        name: "Deliver",
        sentence: "Accepted by the person it is for",
        metric: "event",
        threshold: 1,
        windowDays: WEEK,
        budgetHours: 20,
      },
    ],
  },
  {
    key: "exit",
    label: "Exit",
    shape: "Decide → tell people → handover → close",
    dated: "derived",
    metrics: ["event"],
    stages: [
      { name: "Decide", sentence: "The decision is written down", metric: "event", threshold: 1, windowDays: WEEK, budgetHours: 2 },
      {
        name: "Tell people",
        sentence: "Everyone affected has heard it from me",
        metric: "event",
        threshold: 1,
        windowDays: WEEK,
        budgetHours: 4,
      },
      {
        name: "Handover",
        sentence: "The handover meeting happened",
        metric: "event",
        threshold: 1,
        windowDays: FORTNIGHT,
        budgetHours: 10,
      },
      { name: "Close", sentence: "Nothing of mine is left running", metric: "event", threshold: 1, windowDays: WEEK, budgetHours: 4 },
    ],
  },
  {
    key: "evergreen",
    label: "Evergreen",
    shape: "No stages, no date — a budget kept",
    dated: "none",
    metrics: [],
    stages: [],
  },
];

export const templateOf = (key: ProjectTemplate) => TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];

export const METRIC_LABELS: Record<GateMetric, string> = {
  days: "Days used",
  people: "Distinct people",
  throughput: "Things done",
  event: "It happened",
  hours: "Hours invested",
};

/** "1 of 3 people", "4 of 7 days", "12.5 of 20 h" — the count as the card says it. */
export function gateReadout(metric: GateMetric, count: number, threshold: number) {
  switch (metric) {
    case "days":
      return `${count} of ${threshold} days`;
    case "people":
      return `${count} of ${threshold} people`;
    case "throughput":
      return `${count} of ${threshold} done`;
    case "hours":
      return `${count} of ${threshold} h`;
    case "event":
      return count >= 1 ? "Happened" : "Not yet";
  }
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  held: "Held",
  parked: "Parked",
  shipped: "Shipped",
  killed: "Killed",
};

/** The three that keep a card: a decision was made and the card stays to say which. */
export const ARCHIVE_STATUSES: readonly ProjectStatus[] = ["parked", "shipped", "killed"];
