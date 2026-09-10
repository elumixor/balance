import { z } from "zod";

/** The shapes the model's two answers take — both proposals for a person to act on. */
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
export type WeekNote = z.infer<typeof weekNoteSchema>;
