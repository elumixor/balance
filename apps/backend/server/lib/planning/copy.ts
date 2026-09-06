import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { sessionCopy } from "../../db/schema";
import { env } from "../env";
import { type Angle, type CopyInput, fallback, pickAngle, type SessionCopy } from "./copy-fallback";
import { addDays, type Day } from "./days";

export type { CopyInput, CopyPoint, SessionCopy } from "./copy-fallback";

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

const copySchema = z.object({
  title: z.string().max(TITLE_MAX),
  body: z.string().max(BODY_MAX),
  points: z
    .array(z.object({ text: z.string().max(POINT_MAX), eventId: z.string().nullable() }))
    .min(2)
    .max(4),
});

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

  // Yesterday's words, so today's do not take the same shape — see `copy-fallback.ts`.
  const previous = await recent(userId, day);
  const shaped: CopyInput = { ...input, avoid: previous[0]?.angle ?? null };

  // Too early to say anything true about a day that is still happening — see `isFresh`.
  if (!persist) return fallback(shaped);

  const copy =
    (await generate(
      shaped,
      previous.map((row) => row.title),
    )) ?? fallback(shaped);
  await db
    .insert(sessionCopy)
    .values({ userId, day, slot: input.slot, data: copy as unknown as Record<string, unknown> })
    .onConflictDoNothing();

  return copy;
}

/** The last few days' words, newest first — what today's have to differ from. */
async function recent(userId: string, day: Day): Promise<{ angle: Angle | null; title: string }[]> {
  const rows = await db.query.sessionCopy.findMany({
    where: and(
      eq(sessionCopy.userId, userId),
      gte(sessionCopy.day, addDays(day, -RECENT_DAYS)),
      lt(sessionCopy.day, day),
    ),
    orderBy: (row, { desc }) => [desc(row.day)],
    limit: RECENT_DAYS,
  });
  return rows.map((row) => {
    const data = row.data as unknown as Partial<SessionCopy>;
    return { angle: data.angle ?? null, title: data.title ?? "" };
  });
}
const RECENT_DAYS = 3;

/** Forgets a day's words, so the next ask writes them again. */
export async function clearSessionCopy(userId: string, day: Day) {
  await db.delete(sessionCopy).where(and(eq(sessionCopy.userId, userId), eq(sessionCopy.day, day)));
}

async function generate(input: CopyInput, previousTitles: string[]): Promise<SessionCopy | null> {
  const angle = pickAngle(input);
  try {
    const { object } = await generateObject({
      model: createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(MODEL),
      schema: copySchema,
      system: SYSTEM,
      prompt: promptFor(input, angle, previousTitles),
    });
    return { ...object, generated: true, angle };
  } catch {
    // A model that is down, rate-limited or slow must not cost the user their reminder.
    return null;
  }
}

const SYSTEM = `You write the two lines of a notification and a few short points for a daily
planning app called Balance. The person tracks how their week's hours land across the categories
they care about, and is asked twice a day to look back and to draw the day ahead.

Voice:
- Write from the far side of the thing: how it will feel to have already done it. Not "finish the
  report" but "the report will be behind you by nine".
- Warm, specific, and short. Plain words. No exclamation marks, no coaching cliches, no emoji.
- Never name a failure, a miss, a shortfall or a streak that broke. There is always something that
  went well, and that is what you say.
- Use the real numbers and the real event titles you are given. Never invent one.
- Second person. Never mention that you are an assistant or a model.

The notification:
- The title is a hook, not a summary: one concrete thing — the first block on the day ahead, the
  biggest thing done, the streak, the stars waiting — never a total of hours.
- Lead with the angle you are given. It is chosen so consecutive days read differently; the
  previous titles are listed so you can avoid their shape as well as their words.
- A day with nothing counted gets no numbers at all: one bright, simple line about the day ahead
  being a clean page. Never pad a quiet day with statistics.
- The body is one or two short sentences, and ends on the day ahead.
- Each point may name the event it is about by its id, so the app can link it. Use null when a
  point is about the day as a whole.`;

function promptFor(input: CopyInput, angle: Angle, previousTitles: string[]) {
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
    const at = new Date(block.start).toLocaleTimeString("en-GB", {
      timeZone: input.timeZone,
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`- [${block.id}] ${at} ${block.title}${block.categoryName ? ` (${block.categoryName})` : ""}`);
  }

  if (input.streak > 1) lines.push(`\nPlanned ${input.streak} days in a row so far.`);
  if (!input.targetPlanned && input.awardStars > 0) {
    lines.push(`Planning it is worth ${input.awardStars} stars, on top of ${input.stars}.`);
  }

  lines.push(`\nLead with this angle: ${ANGLE_HINTS[angle]}`);
  if (previousTitles.length > 0) {
    lines.push("Recent titles, whose shape and words you must not repeat:");
    for (const title of previousTitles) lines.push(`- ${title}`);
  }

  lines.push(
    "\nWrite a title (under 60 characters), a body (under 160), and 2-4 points. The last point" +
      " should be about the day ahead and how it will feel once it has gone the way it is drawn.",
  );
  return lines.join("\n");
}

const ANGLE_HINTS: Record<Angle, string> = {
  first: "the first block on the day ahead, and its time",
  biggest: "the biggest thing done in the day looked back on",
  streak: "the run of days planned in a row, and the one that tonight adds",
  stars: "the stars that planning the day ahead pays",
  planned: "the day ahead being already decided, so there is nothing left to work out",
  quiet: "a clean page — nothing to count, everything to decide; no numbers",
  week: "the week behind, on the record, and the seven blank days ahead",
};

function round(hours: number) {
  return Math.round(hours * 10) / 10;
}
