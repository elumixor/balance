import { experimental_decide as decide } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import { categories, eventClassifications, eventMappings, projects } from "~/db/schema";
import { DECISION_MODEL, decisionModel } from "~/lib/ai/decision";
import { captureError } from "~/lib/telemetry";
import {
  buildOptions,
  type Candidate,
  type Choice,
  candidatesOf,
  confidenceOf,
  type Example,
  eventState,
  examplesFor,
  judge,
  keyOf,
  type Verdict,
} from "./classify";
import { CalendarEventsService, type ResolvedEvent } from "./events-service";
import { EventMappingService } from "./mappings-service";
import type { MappingScope } from "./types";

const CONCURRENCY = 6;
/** Jev now and then answers in a shape the SDK refuses; a second ask clears it. */
const ATTEMPTS = 2;
/** Enough for a full week inside the client's request timeout; the rest are asked about next time. */
const MAX_PER_RUN = 36;
/** How far back the person's own filings are read for precedents. */
const HISTORY_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Files the grey blocks of a window by themselves: each event that counts as nothing is asked
 * about once — a series once for all its occurrences — and a sure answer becomes its mapping, the
 * same row a person's choice would write. An unsure one is remembered as asked and left grey.
 *
 * It never fails a screen: a model that is down or refuses is reported and the blocks stay as
 * they were, to be asked about on the next run.
 */
export class EventClassificationService {
  constructor(private readonly userId: string) {}

  async classify(from: Date, to: Date): Promise<{ classified: number }> {
    const range = await new CalendarEventsService(this.userId).resolve(new Date(from.getTime() - HISTORY_MS), to);
    if (!range.connected) return { classified: 0 };

    const [spheres, open] = await Promise.all([
      db.query.categories.findMany({
        where: and(eq(categories.userId, this.userId), eq(categories.archived, false), eq(categories.isBuffer, false)),
      }),
      db.query.projects.findMany({
        where: and(eq(projects.userId, this.userId), eq(projects.archived, false), eq(projects.status, "active")),
      }),
    ]);
    if (spheres.length === 0) return { classified: 0 };

    const todo = await this.#unasked(candidatesOf(range.events, from, to));
    if (todo.length === 0) return { classified: 0 };

    const options = buildOptions(spheres, open);
    const filed = filedExamples(range.events, spheres, open);
    const verdicts = await mapLimited(todo, (candidate) => this.#ask(candidate, options, filed));

    let classified = 0;
    for (const [i, verdict] of verdicts.entries()) {
      if (!verdict) continue;
      if (await this.#record(todo[i], verdict)) classified += 1;
    }
    return { classified };
  }

  /** Candidates nobody has asked about yet, nearest the window's start first. */
  async #unasked(candidates: readonly Candidate[]) {
    if (candidates.length === 0) return [];
    const asked = await db
      .select({
        calendarId: eventClassifications.calendarId,
        scope: eventClassifications.scope,
        externalEventId: eventClassifications.externalEventId,
      })
      .from(eventClassifications)
      .where(
        and(
          eq(eventClassifications.userId, this.userId),
          inArray(
            eventClassifications.externalEventId,
            candidates.map((candidate) => candidate.externalEventId),
          ),
        ),
      );
    const seen = new Set(asked.map((row) => `${row.calendarId}|${row.scope}|${row.externalEventId}`));
    return candidates.filter((candidate) => !seen.has(keyOf(candidate))).slice(0, MAX_PER_RUN);
  }

  async #ask(candidate: Candidate, options: ReturnType<typeof buildOptions>, filed: readonly Example[]) {
    const state = eventState(candidate.event, examplesFor(candidate.event.title, filed));
    const questions = {
      purpose: {
        type: "choice" as const,
        instructions:
          "What was the time in this calendar `event` spent on? Pick the project it was work on when one clearly " +
          "matches, the part of life it belongs to when only that is clear, and `none` when the event does not say " +
          "enough. `previouslyFiledAs` lists how the person filed similar events themselves — follow it.",
        criteria: options.criteria,
      },
    };
    for (let attempt = 1; ; attempt++) {
      try {
        const { answers, providerMetadata } = await decide({ model: decisionModel, state, questions });
        return judge(answers.purpose, confidenceOf(providerMetadata, "purpose"), options.choices);
      } catch (error) {
        if (attempt < ATTEMPTS) continue;
        await captureError(error, { path: "calendar-classify", userId: this.userId });
        return null;
      }
    }
  }

  /**
   * The attempt is written whatever it said, so the block is never asked about twice. The mapping
   * is only written when the answer was sure and the event still counts as nothing — a person who
   * filed it while the model was thinking wins.
   */
  async #record(candidate: Candidate, verdict: Verdict): Promise<boolean> {
    const key = {
      userId: this.userId,
      calendarId: candidate.event.calendarId,
      scope: candidate.scope,
      externalEventId: candidate.externalEventId,
    };
    const [attempt] = await db
      .insert(eventClassifications)
      .values({
        ...key,
        categoryId: verdict.choice?.categoryId ?? null,
        projectId: verdict.choice?.projectId ?? null,
        probability: verdict.probability,
        confidence: verdict.confidence,
        filed: verdict.filed,
        model: DECISION_MODEL,
      })
      .onConflictDoNothing()
      .returning({ id: eventClassifications.id });
    if (!attempt || !verdict.filed || !verdict.choice) return false;
    return this.#file(key, verdict.choice);
  }

  async #file(
    key: { userId: string; calendarId: string; scope: MappingScope; externalEventId: string },
    choice: Choice,
  ) {
    const existing = await db.query.eventMappings.findFirst({
      where: and(
        eq(eventMappings.userId, key.userId),
        eq(eventMappings.calendarId, key.calendarId),
        eq(eventMappings.scope, key.scope),
        eq(eventMappings.externalEventId, key.externalEventId),
      ),
    });
    if (existing) return false;
    // The mapping write is what forgets the cached week — see `EventMappingService`.
    await new EventMappingService(this.userId).upsert({
      calendarId: key.calendarId,
      scope: key.scope,
      externalEventId: key.externalEventId,
      weights: [{ categoryId: choice.categoryId, weightPercent: 100 }],
      projectId: choice.projectId,
    });
    return true;
  }
}

/** The person's own filings in view, named the way the options name them. */
function filedExamples(
  events: readonly ResolvedEvent[],
  spheres: readonly { id: string; name: string }[],
  open: readonly { id: string; name: string }[],
): Example[] {
  const sphereName = new Map(spheres.map((sphere) => [sphere.id, sphere.name]));
  const projectName = new Map(open.map((project) => [project.id, project.name]));
  return events.flatMap((event) => {
    if (!event.mapping) return [];
    const project = event.mapping.projectId ? projectName.get(event.mapping.projectId) : undefined;
    const top = [...event.weights].sort((a, b) => b.weightPercent - a.weightPercent)[0];
    const sphere = top ? sphereName.get(top.categoryId) : undefined;
    const filedAs = project ? `project ${project}` : sphere ? `${sphere} in general` : null;
    return filedAs ? [{ title: event.title, filedAs }] : [];
  });
}

/** Runs `fn` over `items` with bounded parallelism, preserving order. */
async function mapLimited<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i] as T);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}
