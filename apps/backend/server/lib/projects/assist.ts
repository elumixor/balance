import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { z } from "zod";
import { env } from "../env";

/**
 * The model's six moments, all of them proposals: words, estimates and judgement, handed back
 * for a person to press a button on. Nothing here writes a record, moves a date, marks a gate or
 * sets an outcome — the routes only return what these return — and with no key configured every
 * answer is `{ available: false }`, which every screen already copes with.
 */
const MODEL = "anthropic/claude-sonnet-5";

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

const VOICE = `You help with a personal time-balance app called Balance. The person claims hours a
week from spheres of their life for projects; each project has stages, each stage a gate — a count
in a window compared to a threshold — and a decision date derived from budget and rate.
Plain words, second person, no exclamation marks, no coaching cliches, no emoji. Be specific and
short. Never invent numbers you weren't given. You propose; the person decides.`;

async function ask<T>(schema: z.ZodType<T>, prompt: string): Promise<T | null> {
  try {
    const { object } = await generateObject({
      model: createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(MODEL),
      schema,
      system: VOICE,
      prompt,
    });
    return object;
  } catch (e) {
    // The model is optional by design: a screen with no suggestion is the same screen.
    console.warn("[assist] model unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const assist = {
  /** A vague idea into two or three countable gate sentences, a template, a rate and a budget. */
  create(input: { idea: string; sphere: string; existingProjects: string[] }) {
    return ask(
      createSuggestionSchema,
      `Idea: "${input.idea}". Sphere: ${input.sphere}. Existing projects there: ${input.existingProjects.join(", ") || "none"}.
Decide first whether this is a project (bounded, ends in a decision) or a recurring practice — say
"recurring" when it is something to keep doing rather than finish. For a project, propose the
template (build: my tool -> other people -> product; search: throughput on what the person
controls, never offers received; delivery: one external deadline; exit: events only; simple: one
gate; evergreen: budget only), a starting hours a week, a budget for the first stage, and 2-3
candidate gate sentences for the first stage. Each gate is a count in a window: metric, threshold,
window days, and what would count it from data that already exists (calendar blocks tagged to the
project, a manual row, a ping from the built thing).`,
    );
  },

  /** What to drop when the week is short, as a note over a deterministic fill. */
  week(input: {
    freeHours: number;
    projects: {
      id: string;
      name: string;
      claimed: number;
      logged: number;
      priority: number;
    }[];
    fixed: string[];
  }) {
    return ask(
      weekNoteSchema,
      `Free hours left this week inside working hours: ${input.freeHours}.
Projects wanting hours (id, name, claimed/week, already logged this week, rank where 1 is highest):
${input.projects.map((p) => `- ${p.id} · ${p.name} · ${p.claimed}h · ${p.logged}h logged · rank ${p.priority}`).join("\n")}
Fixed things already on the week: ${input.fixed.join(", ") || "none"}.
Write one short note on the shape of the week. If the claims don't fit, say which projects to give
less to this week (lowest rank first) and how many hours each should get instead. Empty drop list
when everything fits.`,
    );
  },

  /** Names what stopped a stage, and breaks it into estimated subtasks. */
  checkpoint(input: {
    project: string;
    stage: string;
    sentence: string;
    count: number;
    threshold: number;
    note: string;
  }) {
    return ask(
      checkpointHelpSchema,
      `Project "${input.project}", stage "${input.stage}", gate "${input.sentence}" — count ${input.count} of ${input.threshold}.
The person wrote at the checkpoint: "${input.note}".
Name the blocker in one sentence they would recognise as their own, then break the next two weeks
into 2-6 concrete subtasks with estimates in hours.`,
    );
  },

  /** A recommendation on decision day, with the why. The person presses the button. */
  decision(input: {
    project: string;
    stage: string;
    sentence: string;
    count: number;
    threshold: number;
    measurable: boolean;
    hoursInvested: number;
    hoursPerWeek: number;
    extended: boolean;
    isLast: boolean;
    checkpoints: { day: string; count: number; moved: boolean; note: string }[];
  }) {
    return ask(
      decisionAdviceSchema,
      `Project "${input.project}", stage "${input.stage}", gate "${input.sentence}".
Count ${input.count} of ${input.threshold}${input.measurable ? "" : " (window not open yet)"}. Hours invested: ${input.hoursInvested} at ${input.hoursPerWeek}h/week. ${input.extended ? "Already extended once." : "Not extended."} ${input.isLast ? "Last stage." : "More stages follow."}
Checkpoints: ${input.checkpoints.map((c) => `${c.day}: ${c.count}, ${c.moved ? "moved" : "stuck"}${c.note ? ` — ${c.note}` : ""}`).join("; ") || "none"}.
Outcomes: ship (gate passed), hold (passed, not promoted), extend (only if not extended: one named
fix, two weeks), park (needs a trigger), kill, restart (a different bet). Recommend one and say why
in two sentences.`,
    );
  },
  /**
   * A calendar block into a plan: which project it serves, which task it is, the steps inside it,
   * and how long it wants to be. One question at a time when the block is too vague to answer.
   */
  event(input: {
    title: string;
    description: string;
    hours: number;
    sphere: string;
    project: {
      id: string;
      name: string;
      description: string;
      stage: string;
      sentence: string;
      hoursPerWeek: number;
      tasks: {
        id: string;
        title: string;
        estimateHours: number | null;
        done: boolean;
      }[];
    } | null;
    candidates: { id: string; name: string; description: string }[];
    answers: { question: string; answer: string }[];
  }) {
    const tasks = input.project?.tasks ?? [];
    return ask(
      eventPlanSchema,
      `Calendar block: "${input.title}" (${input.hours}h). Notes: "${input.description || "none"}". Sphere: ${input.sphere || "unknown"}.
${
  input.project
    ? `Tagged to project "${input.project.name}" (id ${input.project.id}): ${input.project.description || "no description"}.
Running stage "${input.project.stage}", gate "${input.project.sentence}", ${input.project.hoursPerWeek}h/week.
Open tasks under the stage (id · title · estimate · done):
${tasks.map((t) => `- ${t.id} · ${t.title} · ${t.estimateHours ?? "?"}h · ${t.done ? "done" : "open"}`).join("\n") || "none"}`
    : `Not tagged to a project. Projects it could be for (id · name · description):
${input.candidates.map((c) => `- ${c.id} · ${c.name} · ${c.description || ""}`).join("\n") || "none"}`
}
${input.answers.length > 0 ? `Answers so far:\n${input.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")}` : ""}
Work out what this block is for. If it is time for a project, pick the project by id and, when an
open task fits, the task by id — never invent ids. If the block is one task with an estimate that
fits, steps may be empty. Otherwise break the block into ordered steps with estimates whose sum
is close to the block's length, and suggest hours only when the work clearly needs a different
length. Write a brief that tells the person what to do first when the block starts. Ask one
question, with 2-4 short options, only if the answer would change the plan and nothing above
settles it; otherwise question is null.`,
    );
  },
};
