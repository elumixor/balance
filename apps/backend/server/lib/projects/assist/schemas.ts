import { z } from "zod";

/** The shapes the model's six answers take — every one a proposal for a person to act on. */
const gateMetric = z.enum(["days", "people", "throughput", "event", "hours"]);
const template = z.enum(["build", "search", "delivery", "exit", "evergreen", "simple"]);

export const createSuggestionSchema = z.object({
  /** "recurring" is a valid answer: this is a practice, not a project. */
  kind: z.enum(["project", "recurring"]),
  reason: z.string(),
  template,
  hoursPerWeek: z.number().min(0).max(40),
  budgetHours: z.number().min(0).max(1000),
  gates: z
    .array(
      z.object({
        sentence: z.string(),
        metric: gateMetric,
        threshold: z.number().int().min(1),
        windowDays: z.number().int().min(1).max(90),
        /** What existing data would count it — calendar blocks, a manual row, a ping. */
        countedBy: z.string(),
      }),
    )
    .min(2)
    .max(3),
});

export const weekNoteSchema = z.object({
  note: z.string(),
  /** Projects to give less than their claim this week, by id, with why. */
  drop: z.array(
    z.object({
      projectId: z.string(),
      hours: z.number().min(0),
      why: z.string(),
    }),
  ),
});

export const checkpointHelpSchema = z.object({
  /** What stopped it, in one sentence the person would recognise as theirs. */
  blocker: z.string(),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        estimateHours: z.number().min(0.25).max(40),
      }),
    )
    .max(6),
});

export const decisionAdviceSchema = z.object({
  recommendation: z.enum(["ship", "extend", "park", "kill", "restart", "hold"]),
  why: z.string(),
});

export const eventPlanSchema = z.object({
  /** One line on what this block is, in the person's own terms. */
  summary: z.string(),
  /**
   * Set only when the answer genuinely depends on something the person hasn't said. Options are
   * the pills they tap; the client sends the answer back with the next ask.
   */
  question: z.object({ text: z.string(), options: z.array(z.string()).min(2).max(4) }).nullable(),
  /** Which project this block is for, by id from the list given, or null when none fits. */
  projectId: z.string().nullable(),
  /** An existing open task this block is for, by id, or null. */
  taskId: z.string().nullable(),
  /** The work itself, in order. Empty when the block is one thing and needs no breaking down. */
  steps: z
    .array(
      z.object({
        title: z.string(),
        estimateHours: z.number().min(0.25).max(40),
      }),
    )
    .max(8),
  /** What to do when the block starts — the first sentence to read, not a summary. */
  brief: z.string(),
  /** How long the block should be, when the steps don't fit or overfill it. Null keeps it. */
  hours: z.number().min(0.25).max(12).nullable(),
});

export type EventPlan = z.infer<typeof eventPlanSchema>;
export type CreateSuggestion = z.infer<typeof createSuggestionSchema>;
export type WeekNote = z.infer<typeof weekNoteSchema>;
export type CheckpointHelp = z.infer<typeof checkpointHelpSchema>;
export type DecisionAdvice = z.infer<typeof decisionAdviceSchema>;
