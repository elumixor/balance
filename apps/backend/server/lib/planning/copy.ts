import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { sessionCopy } from "../../db/schema";
import { env } from "../env";
import type { Day } from "./days";
import type { CategoryHours, SessionBlock, Slot } from "./service";

/**
 * What a session says, in the app's own voice.
 *
 * Written once per slot per day and kept, because the same words have to be in two places: the
 * notification, handed to iOS hours ahead while the phone is asleep, and the screen that opens
 * when it is tapped. Generating a fresh sentence for the screen would quietly contradict the
 * banner the user just read, which is worse than any sentence being a few hours old.
 *
 * The voice is the whole point. A reminder that lists what is left undone is a reminder people
 * turn off. This one says how it will feel to have already done it — the day imagined from the
 * far side — and never names a failure, a miss or a shortfall.
 */

/** Short enough for a lock screen: iOS shows about this much before it stops. */
const TITLE_MAX = 60;
const BODY_MAX = 160;
const POINT_MAX = 110;

const MODEL = "anthropic/claude-sonnet-5";

export interface CopyPoint {
  text: string;
  /** The event this is about, so the screen can draw it as a pill back to the calendar. */
  eventId: string | null;
}

export interface SessionCopy {
  /** The notification's two lines. */
  title: string;
  body: string;
  /** What the screen shows under them — two to four of them, biggest thing first. */
  points: CopyPoint[];
  /** Whether these words came from a model or from the fallback below. */
  generated: boolean;
}

const copySchema = z.object({
  title: z.string().max(TITLE_MAX),
  body: z.string().max(BODY_MAX),
  points: z
    .array(z.object({ text: z.string().max(POINT_MAX), eventId: z.string().nullable() }))
    .min(2)
    .max(4),
});

export interface CopyInput {
  slot: Slot;
  /** The day being looked back on, and what happened in it. */
  reviewed: Day;
  hours: number;
  categories: CategoryHours[];
  top: SessionBlock[];
  /** The day being planned, and what is on it so far. */
  target: Day;
  targetBlocks: SessionBlock[];
  targetPlanned: boolean;
  streak: number;
  stars: number;
  awardStars: number;
}

/**
 * The words for a slot, from the store if they have been written, from a model if not.
 *
 * A failure here is never allowed to become a missing reminder — the fallback below is a real
 * answer, not an error message, and the row is written either way so the screen and the banner
 * still agree.
 */
export async function sessionCopyFor(userId: string, day: Day, input: CopyInput, persist = true): Promise<SessionCopy> {
  const existing = await db.query.sessionCopy.findFirst({
    where: and(eq(sessionCopy.userId, userId), eq(sessionCopy.day, day), eq(sessionCopy.slot, input.slot)),
  });
  if (existing) return existing.data as unknown as SessionCopy;

  // Too early to say anything true about a day that is still happening — see `isFresh`.
  if (!persist) return fallback(input);

  const copy = (await generate(input)) ?? fallback(input);
  await db
    .insert(sessionCopy)
    .values({ userId, day, slot: input.slot, data: copy as unknown as Record<string, unknown> })
    .onConflictDoNothing();

  return copy;
}

/** Forgets a day's words, so the next ask writes them again. */
export async function clearSessionCopy(userId: string, day: Day) {
  await db.delete(sessionCopy).where(and(eq(sessionCopy.userId, userId), eq(sessionCopy.day, day)));
}

async function generate(input: CopyInput): Promise<SessionCopy | null> {
  try {
    const { object } = await generateObject({
      model: createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(MODEL),
      schema: copySchema,
      system: SYSTEM,
      prompt: promptFor(input),
    });
    return { ...object, generated: true };
  } catch {
    // A model that is down, rate-limited or slow must not cost the user their reminder.
    return null;
  }
}

const SYSTEM = `You write the two lines of a notification and a few short points for a daily
planning app called Balance. The person tracks how their week's hours land across the categories
they care about.

Voice:
- Write from the far side of the thing: how it will feel to have already done it. Not "finish the
  report" but "the report will be behind you by nine".
- Warm, specific, and short. Plain words. No exclamation marks, no coaching cliches, no emoji.
- Never name a failure, a miss, a shortfall or a streak that broke. There is always something that
  went well, and that is what you say.
- Use the real numbers and the real event titles you are given. Never invent one.
- Each point may name the event it is about by its id, so the app can link it. Use null when a
  point is about the day as a whole.
- Second person. Never mention that you are an assistant or a model.`;

function promptFor(input: CopyInput) {
  const lines: string[] = [];
  lines.push(`Slot: ${input.slot}.`);
  lines.push(
    input.slot === "morning"
      ? `It is the morning of ${input.target}. Look back on ${input.reviewed}, then at the day ahead.`
      : input.slot === "weekly"
        ? `It is Sunday evening. Look back on the week ending ${input.reviewed}, then at the week ahead.`
        : `It is the evening of ${input.reviewed}. Look back on today, then at ${input.target}.`,
  );

  lines.push(`\nThe day looked back on: ${round(input.hours)} hours accounted for.`);
  for (const category of input.categories.filter((c) => c.hours > 0).slice(0, 5)) {
    lines.push(`- ${category.name}: ${round(category.hours)}h of a ${round(category.targetHours)}h weekly target`);
  }

  if (input.top.length > 0) {
    lines.push("\nThe biggest things in it:");
    for (const block of input.top) lines.push(`- [${block.id}] ${block.title} — ${round(block.hours)}h`);
  }

  lines.push(`\nThe day being planned (${input.target}) currently holds:`);
  if (input.targetBlocks.length === 0) lines.push("- nothing yet");
  for (const block of input.targetBlocks.slice(0, 8)) {
    lines.push(`- [${block.id}] ${block.title}${block.categoryName ? ` (${block.categoryName})` : ""}`);
  }

  if (input.streak > 1) lines.push(`\nPlanned ${input.streak} days in a row so far.`);
  if (!input.targetPlanned && input.awardStars > 0) {
    lines.push(`Planning it is worth ${input.awardStars} stars, on top of ${input.stars}.`);
  }

  lines.push(
    "\nWrite a title (under 60 characters), a body (under 160), and 2-4 points. The last point" +
      " should be about the day ahead and how it will feel once it has gone the way it is drawn.",
  );
  return lines.join("\n");
}

/**
 * The same shape, from the numbers alone.
 *
 * Not an apology and not a placeholder: an account with no key configured gets this every day and
 * should never be able to tell that something was missing.
 */
export function fallback(input: CopyInput): SessionCopy {
  const best = input.categories.filter((category) => category.hours > 0)[0];
  const biggest = input.top[0];
  const hours = round(input.hours);

  const title =
    input.slot === "weekly"
      ? `A ${hours}-hour week behind you`
      : input.slot === "morning"
        ? `Yesterday came to ${hours} hours`
        : `${hours} hours, accounted for`;

  const body = best
    ? `${round(best.hours)}h of it on ${best.name.toLowerCase()}. Tomorrow is still yours to shape.`
    : "Nothing counted yet today — the shape of tomorrow is still entirely open.";

  const points: CopyPoint[] = [];
  if (biggest) points.push({ text: `${biggest.title} took ${round(biggest.hours)}h of it.`, eventId: biggest.id });
  if (best)
    points.push({
      text: `${best.name} is at ${round(best.hours)}h against ${round(best.targetHours)}h a week.`,
      eventId: null,
    });
  if (input.streak > 1) points.push({ text: `${input.streak} days planned in a row.`, eventId: null });
  points.push({
    text: input.targetPlanned
      ? "Tomorrow is already drawn. Waking up to a day you have already decided is the whole trick."
      : `Give tomorrow its shape and you will start it knowing exactly what it is for.`,
    eventId: null,
  });

  return { title, body, points: points.slice(0, 4), generated: false };
}

function round(hours: number) {
  return Math.round(hours * 10) / 10;
}
