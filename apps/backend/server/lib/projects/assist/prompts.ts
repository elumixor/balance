import type { z } from "zod";
import { ask as askModel } from "~/lib/ai/gateway";

/** What each of the two moments is asked, word for word, and the shape of what it is told. */

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

export interface EventInput {
  title: string;
  description: string;
  hours: number;
  sphere: string;
  project: {
    id: string;
    name: string;
    description: string;
    stage: string | null;
    hoursPerWeek: number;
    tasks: {
      id: string;
      title: string;
      estimateHours: number | null;
      open: boolean;
    }[];
  } | null;
  candidates: { id: string; name: string; description: string }[];
  answers: { question: string; answer: string }[];
}

const VOICE = `You help with a personal time-balance app called Balance. The person claims hours a
week from spheres of their life for projects; a project holds stages, and a stage holds the tasks
that make it up, each with its own days on a timeline.
Plain words, second person, no exclamation marks, no coaching cliches, no emoji. Be specific and
short. Never invent numbers you weren't given. You propose; the person decides.`;

/** One ask in the assistant's voice. Null when the model has nothing — see `ai/gateway`. */
export function ask<T>(schema: z.ZodType<T>, prompt: string): Promise<T | null> {
  return askModel({ schema, system: VOICE, prompt });
}

export const prompts = {
  week(input: WeekInput): string {
    return `Free hours left this week inside working hours: ${input.freeHours}.
Projects wanting hours (id, name, claimed/week, already logged this week, rank where 1 is highest):
${input.projects.map((p) => `- ${p.id} · ${p.name} · ${p.claimed}h · ${p.logged}h logged · rank ${p.priority}`).join("\n")}
Fixed things already on the week: ${input.fixed.join(", ") || "none"}.
Write one short note on the shape of the week. If the claims don't fit, say which projects to give
less to this week (lowest rank first) and how many hours each should get instead. Empty drop list
when everything fits.`;
  },

  event(input: EventInput): string {
    const tasks = input.project?.tasks ?? [];
    return `Calendar block: "${input.title}" (${input.hours}h). Notes: "${input.description || "none"}". Sphere: ${input.sphere || "unknown"}.
${
  input.project
    ? `Tagged to project "${input.project.name}" (id ${input.project.id}): ${input.project.description || "no description"}.
${input.project.stage ? `Current stage "${input.project.stage}". ` : ""}${input.project.hoursPerWeek}h/week.
Its tasks (id · title · estimate · state):
${tasks.map((t) => `- ${t.id} · ${t.title} · ${t.estimateHours ?? "?"}h · ${t.open ? "open" : "done"}`).join("\n") || "none"}`
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
