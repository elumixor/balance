import type { z } from "zod";
import { ask as askModel } from "~/lib/ai/gateway";

/** What each of the six moments is asked, word for word, and the shape of what it is told. */

export interface CreateInput {
  idea: string;
  sphere: string;
  existingProjects: string[];
}

export interface WeekInput {
  freeHours: number;
  projects: {
    id: string;
    name: string;
    claimed: number;
    logged: number;
    priority: number;
  }[];
  fixed: string[];
}

export interface CheckpointInput {
  project: string;
  stage: string;
  sentence: string;
  count: number;
  threshold: number;
  note: string;
}

export interface DecisionInput {
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
}

export interface EventInput {
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
}

const VOICE = `You help with a personal time-balance app called Balance. The person claims hours a
week from spheres of their life for projects; each project has stages, each stage a gate — a count
in a window compared to a threshold — and a decision date derived from budget and rate.
Plain words, second person, no exclamation marks, no coaching cliches, no emoji. Be specific and
short. Never invent numbers you weren't given. You propose; the person decides.`;

/** One ask in the assistant's voice. Null when the model has nothing — see `ai/gateway`. */
export function ask<T>(schema: z.ZodType<T>, prompt: string): Promise<T | null> {
  return askModel({ schema, system: VOICE, prompt });
}

export const prompts = {
  create(input: CreateInput): string {
    return `Idea: "${input.idea}". Sphere: ${input.sphere}. Existing projects there: ${input.existingProjects.join(", ") || "none"}.
Decide first whether this is a project (bounded, ends in a decision) or a recurring practice — say
"recurring" when it is something to keep doing rather than finish. For a project, propose the
template (build: my tool -> other people -> product; search: throughput on what the person
controls, never offers received; delivery: one external deadline; exit: events only; simple: one
gate; evergreen: budget only), a starting hours a week, a budget for the first stage, and 2-3
candidate gate sentences for the first stage. Each gate is a count in a window: metric, threshold,
window days, and what would count it from data that already exists (calendar blocks tagged to the
project, a manual row, a ping from the built thing).`;
  },

  week(input: WeekInput): string {
    return `Free hours left this week inside working hours: ${input.freeHours}.
Projects wanting hours (id, name, claimed/week, already logged this week, rank where 1 is highest):
${input.projects.map((p) => `- ${p.id} · ${p.name} · ${p.claimed}h · ${p.logged}h logged · rank ${p.priority}`).join("\n")}
Fixed things already on the week: ${input.fixed.join(", ") || "none"}.
Write one short note on the shape of the week. If the claims don't fit, say which projects to give
less to this week (lowest rank first) and how many hours each should get instead. Empty drop list
when everything fits.`;
  },

  checkpoint(input: CheckpointInput): string {
    return `Project "${input.project}", stage "${input.stage}", gate "${input.sentence}" — count ${input.count} of ${input.threshold}.
The person wrote at the checkpoint: "${input.note}".
Name the blocker in one sentence they would recognise as their own, then break the next two weeks
into 2-6 concrete subtasks with estimates in hours.`;
  },

  decision(input: DecisionInput): string {
    return `Project "${input.project}", stage "${input.stage}", gate "${input.sentence}".
Count ${input.count} of ${input.threshold}${input.measurable ? "" : " (window not open yet)"}. Hours invested: ${input.hoursInvested} at ${input.hoursPerWeek}h/week. ${input.extended ? "Already extended once." : "Not extended."} ${input.isLast ? "Last stage." : "More stages follow."}
Checkpoints: ${input.checkpoints.map((c) => `${c.day}: ${c.count}, ${c.moved ? "moved" : "stuck"}${c.note ? ` — ${c.note}` : ""}`).join("; ") || "none"}.
Outcomes: ship (gate passed), hold (passed, not promoted), extend (only if not extended: one named
fix, two weeks), park (needs a trigger), kill, restart (a different bet). Recommend one and say why
in two sentences.`;
  },

  event(input: EventInput): string {
    const tasks = input.project?.tasks ?? [];
    return `Calendar block: "${input.title}" (${input.hours}h). Notes: "${input.description || "none"}". Sphere: ${input.sphere || "unknown"}.
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
settles it; otherwise question is null.`;
  },
};
