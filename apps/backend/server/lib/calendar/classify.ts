import type { ResolvedEvent } from "./events-service";
import type { MappingScope } from "./types";

/**
 * The pure half of filing grey blocks by themselves: what the decision model is offered, what it
 * is shown about an event, and when its answer is sure enough to write. The service beside it
 * (`classify-service.ts`) is the database and the model call around these.
 */

/** A choice leans towards its first option, so "none" goes first: a sphere has to earn the match. */
export const NONE = "none";

/** Below either bar the answer is kept as an attempt and the block stays grey for a person. */
export const THRESHOLDS = { probability: 0.7, confidence: 0.6 } as const;

export interface SphereOption {
  readonly id: string;
  readonly name: string;
}

/** What an option stands for: the sphere the hours are filed under. */
export interface Choice {
  readonly categoryId: string;
}

export interface Options {
  readonly criteria: Record<string, string | null>;
  readonly choices: ReadonlyMap<string, Choice>;
}

/** Spheres as options. Keys are short and positional — an id is forty characters the model reads for nothing. */
export function buildOptions(spheres: readonly SphereOption[]): Options {
  const criteria: Record<string, string | null> = {
    [NONE]: "None of these clearly fits — a social plan, an errand, somebody else's meeting; a person must decide",
  };
  const choices = new Map<string, Choice>();

  spheres.forEach((sphere, i) => {
    const key = `s${i + 1}`;
    criteria[key] = `The "${sphere.name}" part of life`;
    choices.set(key, { categoryId: sphere.id });
  });

  return { criteria, choices };
}

/** One event the person filed themselves, as the model is shown it: the words and where it went. */
export interface Example {
  readonly title: string;
  readonly filedAs: string;
}

/**
 * The person's own filings nearest to this title by shared words — "Standup" learns from the last
 * "Standup", not from a week of unrelated blocks. Nothing shares a word: no examples, rather than
 * noise that would read as a precedent.
 */
export function examplesFor(title: string, filed: readonly Example[], max = 5): Example[] {
  const words = wordsOf(title);
  if (words.size === 0) return [];
  const seen = new Set<string>();
  return filed
    .map((example) => ({ example, score: overlap(words, wordsOf(example.title)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .filter(({ example }) => {
      const key = `${example.title.trim().toLowerCase()}|${example.filedAs}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .map(({ example }) => example);
}

function wordsOf(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3),
  );
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared;
}

/** What the model is told about one event. Plain JSON, so every field is a value or null. */
export function eventState(event: ResolvedEvent, examples: readonly Example[]) {
  const zone = event.timeZone ?? "UTC";
  const at = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(event.start);
  const others = event.attendees.filter((attendee) => !attendee.self && !attendee.resource);
  return {
    event: {
      title: event.title.trim(),
      description:
        event.description
          ?.replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500) || null,
      location: event.location,
      when: at,
      minutes: Math.round((event.end.getTime() - event.start.getTime()) / 60_000),
      repeats: event.seriesId !== null,
      call: event.conferenceName,
      organizedBySelf: event.organizer ? event.organizer.self : true,
      organizer: event.organizer && !event.organizer.self ? (event.organizer.name ?? event.organizer.email) : null,
      otherGuests: others.length,
    },
    previouslyFiledAs: examples.map((example) => ({ title: example.title, filedAs: example.filedAs })),
  };
}

export interface Verdict {
  /** What the model picked, or null for "none" — kept whether or not it was sure enough. */
  readonly choice: Choice | null;
  readonly probability: number | null;
  readonly confidence: number | null;
  /** Sure enough to become the event's mapping. */
  readonly filed: boolean;
}

/**
 * The model's answer, judged. Both bars have to be cleared: the option's own probability, and the
 * model's confidence in the question as a whole, which is low when the event says too little to
 * tell anything apart.
 */
export function judge(
  answer: { choice: string; probabilities?: Record<string, number> },
  confidence: number | null,
  choices: ReadonlyMap<string, Choice>,
  thresholds: { probability: number; confidence: number } = THRESHOLDS,
): Verdict {
  const choice = answer.choice === NONE ? null : (choices.get(answer.choice) ?? null);
  const probability = answer.probabilities?.[answer.choice] ?? null;
  const filed =
    choice !== null && (probability ?? 0) >= thresholds.probability && (confidence ?? 0) >= thresholds.confidence;
  return { choice, probability, confidence, filed };
}

/** The confidence Jev reports per question, under its own key in the provider metadata. */
export function confidenceOf(metadata: unknown, question: string): number | null {
  const value = (metadata as { typesafe?: { confidence?: Record<string, unknown> } } | undefined)?.typesafe
    ?.confidence?.[question];
  return typeof value === "number" ? value : null;
}

/** One thing to ask about: an event, and the mapping key a sure answer would be written under. */
export interface Candidate {
  readonly event: ResolvedEvent;
  readonly scope: MappingScope;
  readonly externalEventId: string;
}

export const keyOf = (candidate: Candidate) =>
  `${candidate.event.calendarId}|${candidate.scope}|${candidate.externalEventId}`;

/**
 * The grey blocks of `[from, to)` worth asking about: timed, not declined or cancelled, with a
 * title to read. A series is one candidate — unless any occurrence of it in view has been filed by
 * hand, which says the person files that series one at a time and a series answer would cover theirs.
 */
export function candidatesOf(events: readonly ResolvedEvent[], from: Date, to: Date): Candidate[] {
  const handFiled = new Set(events.flatMap((event) => (event.mapping && event.seriesId ? [event.seriesId] : [])));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const event of events) {
    if (event.start < from || event.start >= to) continue;
    if (event.mapping || event.allDay || !event.countsTowardHours || !event.title.trim()) continue;
    if (event.seriesId && handFiled.has(event.seriesId)) continue;
    const candidate: Candidate = event.seriesId
      ? { event, scope: "series", externalEventId: event.seriesId }
      : { event, scope: "instance", externalEventId: event.id };
    const key = keyOf(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out.sort((a, b) => a.event.start.getTime() - b.event.start.getTime());
}
