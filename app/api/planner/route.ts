import { generateObject } from "ai";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { categories, entries } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/current-user";

export const runtime = "nodejs";

const WEEKS_OF_HISTORY = 4;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_WEEK = MS_PER_HOUR * 24 * 7;

const plannerResponseSchema = z.object({
  overallExplanation: z
    .string()
    .describe("Summary of the tradeoffs made: what hours moved from where and why, in plain language."),
  proposedChanges: z.array(
    z.object({
      categoryId: z.string().describe("The exact category id provided in the input."),
      categoryName: z.string(),
      currentTargetHours: z.number(),
      proposedTargetHours: z.number(),
      rationale: z.string().describe("Why this specific change is being proposed."),
    }),
  ),
  observations: z.array(
    z.object({
      categoryName: z.string(),
      text: z.string().describe("A concrete observation about plan-vs-fact divergence over recent weeks."),
      kind: z.enum(["blip", "pattern"]).describe(
        "'blip' for a one-off deviation, 'pattern' for a likely recurring/structural divergence worth acting on.",
      ),
    }),
  ),
});

export type PlannerResponse = z.infer<typeof plannerResponseSchema>;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const request = typeof body?.request === "string" ? body.request.trim() : "";
  if (!request) {
    return NextResponse.json({ error: "Please describe what you'd like to plan for." }, { status: 400 });
  }

  const user = await getOrCreateDbUser();

  const userCategories = await db.query.categories.findMany({
    where: and(eq(categories.userId, user.id), eq(categories.archived, false)),
  });

  if (userCategories.length === 0) {
    return NextResponse.json(
      { error: "You don't have any categories set up yet. Add some in Config first." },
      { status: 400 },
    );
  }

  // Light-weight actual-vs-target history for the last WEEKS_OF_HISTORY weeks.
  // We reuse the activityCategoryWeights mapping to distribute each entry's
  // duration across the categories its activity contributes to.
  const historyStart = new Date(Date.now() - WEEKS_OF_HISTORY * MS_PER_WEEK);

  const recentEntries = await db.query.entries.findMany({
    where: and(eq(entries.userId, user.id), isNotNull(entries.endedAt), gte(entries.startedAt, historyStart)),
    with: {
      activity: {
        with: { weights: true },
      },
    },
  });

  // weekIndex 0 = most recent complete-ish week bucket, increasing = older.
  const now = Date.now();
  const categoryWeekHours = new Map<string, number[]>(); // categoryId -> hours per week bucket
  for (const cat of userCategories) {
    categoryWeekHours.set(cat.id, new Array(WEEKS_OF_HISTORY).fill(0));
  }

  for (const entry of recentEntries) {
    if (!entry.endedAt) continue;
    const durationHours = (entry.endedAt.getTime() - entry.startedAt.getTime()) / MS_PER_HOUR;
    if (durationHours <= 0) continue;
    const weeksAgo = Math.floor((now - entry.startedAt.getTime()) / MS_PER_WEEK);
    if (weeksAgo < 0 || weeksAgo >= WEEKS_OF_HISTORY) continue;

    const weights = entry.activity?.weights ?? [];
    if (weights.length === 0) continue;

    for (const w of weights) {
      const bucket = categoryWeekHours.get(w.categoryId);
      if (!bucket) continue;
      bucket[weeksAgo] += durationHours * (w.weightPercent / 100);
    }
  }

  const categorySummaries = userCategories.map((cat) => {
    const weeklyActuals = categoryWeekHours.get(cat.id) ?? [];
    return {
      id: cat.id,
      name: cat.name,
      targetHoursPerWeek: Number(cat.targetHoursPerWeek),
      trackingMode: cat.trackingMode,
      isProductiveLoad: cat.isProductiveLoad,
      // index 0 = most recent week, ..., index 3 = 4 weeks ago
      recentWeeklyActualHours: weeklyActuals.map((h) => Math.round(h * 100) / 100),
    };
  });

  const systemPrompt = `You are a time-balance planning assistant. The user tracks how they spend their time across life categories, each with a weekly target in hours. Categories are either "consistency" tracked (should hit target every single week, e.g. sleep) or "average" tracked (fine to fluctuate, judged over the average across weeks, e.g. side projects).

You will be given:
1. The user's current categories with their weekly targets and tracking mode.
2. Their actual logged hours per category for each of the last few weeks (index 0 = most recent week).
3. A free-text request describing what they want to focus on or change.

Your job:
- Propose concrete changes to weekly target hours for the categories that should change, given the user's stated goals. Only include categories in proposedChanges that you actually think should change; leave unaffected categories out.
- Keep proposed targets realistic: the total across all categories should stay compatible with a real week (168 hours), and a person needs sleep and rest.
- Respect the user's explicit constraints (e.g. "keep X at Y hours").
- In overallExplanation, explain the tradeoffs in plain language: what hours moved from where to where and why.
- In observations, look at recentWeeklyActualHours vs targetHoursPerWeek per category. Call out categories that have been consistently over/under target (tag as "pattern") versus a single unusual week (tag as "blip"). Consider trackingMode: for "consistency" categories, any single miss matters more; for "average" categories, judge the average across weeks rather than any one week.`;

  const userPrompt = `Current categories:\n${JSON.stringify(categorySummaries, null, 2)}\n\nUser's request:\n${request}`;

  try {
    const { object } = await generateObject({
      model: "anthropic/claude-sonnet-4.6",
      schema: plannerResponseSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    return NextResponse.json(object satisfies PlannerResponse);
  } catch (err) {
    console.error("Planner generation failed", err);
    return NextResponse.json({ error: "Failed to generate a plan. Please try again." }, { status: 502 });
  }
}
