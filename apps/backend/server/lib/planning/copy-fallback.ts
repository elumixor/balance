import type { Day } from "./days";
import type { CategoryHours, SessionBlock, Slot } from "./service";

/**
 * The words for a session when no model wrote them — and the shape the model's words follow.
 *
 * A reminder that reads the same every evening stops being read by the third one. So there is no
 * single template here: each sitting picks one *angle* — the first thing on the day ahead, the
 * biggest thing done, the streak, the stars on the table, or, on a day with nothing to count, one
 * bright line about the day ahead — and the pick moves with the date, never landing on
 * yesterday's angle twice.
 *
 * Nothing here is padding. A day with no hours gets no "0 hours accounted for": it gets the same
 * sentence a person would say — that tomorrow is a clean page.
 */

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
  /** Which angle the lines took, so the next day's can take another. */
  angle: Angle;
}

export type Angle = "first" | "biggest" | "streak" | "stars" | "planned" | "quiet" | "week";

export interface CopyInput {
  slot: Slot;
  timeZone: string;
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
  /** Yesterday's angle, so today's is a different one. */
  avoid?: Angle | null;
}

/** Which angles the numbers make true. The order matters only for ties. */
export function eligibleAngles(input: CopyInput): Angle[] {
  const angles: Angle[] = [];
  if (input.slot === "weekly") angles.push("week");
  if (input.targetPlanned) angles.push("planned");
  if (input.targetBlocks.length > 0 && !input.targetPlanned) angles.push("first");
  if (input.top.length > 0) angles.push("biggest");
  if (input.streak > 1) angles.push("streak");
  if (input.awardStars > 0 && !input.targetPlanned) angles.push("stars");
  if (input.hours === 0) angles.push("quiet");
  return angles.length > 0 ? angles : ["quiet"];
}

/** A stable pick for the day: the same sitting asked twice gets the same words. */
export function pickAngle(input: CopyInput): Angle {
  const eligible = eligibleAngles(input);
  const candidates = eligible.filter((angle) => angle !== input.avoid);
  const pool = candidates.length > 0 ? candidates : eligible;
  return pool[hash(`${input.reviewed}:${input.slot}`) % pool.length];
}

export function fallback(input: CopyInput): SessionCopy {
  const angle = pickAngle(input);
  const ahead = input.slot === "morning" ? "today" : input.slot === "weekly" ? "the week" : "tomorrow";
  const Ahead = ahead.charAt(0).toUpperCase() + ahead.slice(1);
  const seed = hash(`${input.reviewed}:${input.slot}:lines`);
  const lines = linesFor(angle, input, ahead, Ahead);
  const { title, body } = lines[seed % lines.length];
  return { title, body, points: pointsFor(input, ahead, Ahead), generated: false, angle };
}

type Lines = { title: string; body: string };

function linesFor(angle: Angle, input: CopyInput, ahead: string, Ahead: string): Lines[] {
  const biggest = input.top[0];
  const first = input.targetBlocks[0];
  switch (angle) {
    case "first":
      return [
        {
          title: `${Ahead} opens with ${short(first.title)}`,
          body: `${clock(first.start, input.timeZone)}, already on the page. Two minutes now and the rest of the day falls in behind it.`,
        },
        {
          title: `${clock(first.start, input.timeZone)}: ${short(first.title)}`,
          body: `That much of ${ahead} is decided. Draw the rest and wake up with nothing to work out.`,
        },
      ];
    case "biggest":
      return [
        {
          title: `${short(biggest.title)}: done`,
          body: `${round(biggest.hours)}h, behind you. Give ${ahead} its shape and it goes the same way.`,
        },
        {
          title: `${round(biggest.hours)}h on ${short(biggest.title)}`,
          body: `The biggest thing in the day, and it happened. ${Ahead} is two minutes from being decided.`,
        },
      ];
    case "streak":
      return [
        {
          title: `${input.streak} days planned in a row`,
          body: `Tonight makes it ${input.streak + 1}. Two minutes, and ${ahead} is drawn.`,
        },
        {
          title: `Day ${input.streak + 1} is one tap away`,
          body: `${input.streak} planned in a row so far. Keep the line going.`,
        },
      ];
    case "stars":
      return [
        {
          title: `+${input.awardStars} ★ on the table`,
          body: `${Ahead}, drawn in two minutes, and they are yours.`,
        },
        {
          title: `${input.awardStars} stars for two minutes`,
          body: `Draw ${ahead} now and start it already ahead.`,
        },
      ];
    case "planned":
      return [
        {
          title: `${Ahead} is already decided`,
          body: "Sleep on it. You wake up and just do it.",
        },
        {
          title: "Nothing left to work out",
          body: `${Ahead} is drawn. The only thing left is to live it.`,
        },
      ];
    case "week":
      return [
        {
          title: `A ${round(input.hours)}-hour week, on the record`,
          body: "Sunday evening. Draw the next one before it draws you.",
        },
        {
          title: "Seven blank days ahead",
          body: "Give them a shape tonight and Monday starts on rails.",
        },
      ];
    case "quiet":
      return [
        { title: "Clean slate", body: `Nothing to look back on, everything to decide. ${Ahead} is yours to draw.` },
        { title: `${Ahead}, unwritten`, body: "The best kind of day: the one you get to draw first." },
        { title: "Fresh page", body: `Two minutes now, and ${ahead} has a shape before it starts.` },
      ];
  }
}

function pointsFor(input: CopyInput, ahead: string, Ahead: string): CopyPoint[] {
  const biggest = input.top[0];
  const first = input.targetBlocks[0];
  const points: CopyPoint[] = [];
  if (biggest) points.push({ text: `${biggest.title} took ${round(biggest.hours)}h of it.`, eventId: biggest.id });
  if (input.streak > 1) points.push({ text: `${input.streak} days planned in a row.`, eventId: null });
  if (first && !input.targetPlanned) {
    points.push({
      text: `${Ahead} opens with ${first.title} at ${clock(first.start, input.timeZone)}.`,
      eventId: first.id,
    });
  }
  points.push({
    text: input.targetPlanned
      ? `${Ahead} is already drawn. Waking up to a day you have already decided is the whole trick.`
      : `Give ${ahead} its shape and you will start it knowing exactly what it is for.`,
    eventId: null,
  });
  return points.slice(0, 4);
}

/** A title has sixty characters; an event's name can take most of them. */
const SHORT_MAX = 28;
function short(title: string) {
  const trimmed = title.trim() || "the first block";
  return trimmed.length <= SHORT_MAX ? trimmed : `${trimmed.slice(0, SHORT_MAX - 1).trimEnd()}…`;
}

function clock(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
}

function round(hours: number) {
  return Math.round(hours * 10) / 10;
}

/** FNV-1a: small, stable, and only ever used to spread picks over days. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
