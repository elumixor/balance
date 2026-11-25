import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "~/db";
import { type ActivityPlace, activityEvents } from "~/db/schema";
import { CalendarEventsService, type ResolvedCalendarRange } from "~/lib/calendar/events-service";
import { CategoryService } from "~/lib/categories/service";
import { hoursBySphere, parentsOf } from "~/lib/categories/tree";
import { ApiError, NotFoundError } from "~/lib/http/api-error";
import { addDays, type Day, rangeOf, weekStartOf } from "~/lib/planning/days";
import { PreferencesService } from "~/lib/preferences/service";
import { attribute, type Basis, claimOf, hoursOf, type PlaceRule, toHours } from "./attribution";

export const ACTIVITY_KINDS = ["location", "sleep", "travel", "activity"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityInput {
  readonly externalId: string;
  readonly kind: ActivityKind;
  readonly start: Date;
  readonly end: Date;
  readonly place?: ActivityPlace;
  readonly sphereId?: string;
  readonly confidence?: number;
  readonly raw?: Record<string, unknown>;
}

/** One thing on the timeline: an observation as it was posted, or a calendar block that happened. */
export interface TimelineEvent {
  readonly id: string;
  readonly source: string;
  readonly kind: ActivityKind | "calendar";
  readonly start: string;
  readonly end: string;
  /** A calendar block's title; an observation has none. */
  readonly title: string | null;
  readonly place: ActivityPlace | null;
  /** The sphere it claims on its own, before anything that outranks it is heard. */
  readonly sphereId: string | null;
  readonly basis: Basis | null;
  readonly confidence: number;
}

export interface TimelineSegment {
  readonly start: string;
  readonly end: string;
  readonly sphereId: string;
  readonly basis: Basis;
}

export interface Timeline {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly events: TimelineEvent[];
  /** The lane: who each stretch of the past went to, already settled between everything above. */
  readonly segments: TimelineSegment[];
}

export interface SphereHours {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isBuffer: boolean;
  readonly targetHours: number;
  /** Everything the week's calendar holds for it, past and still ahead. */
  readonly plannedHours: number;
  /** What was observed up to now. A sphere's include its parts'. */
  readonly actualHours: number;
}

export interface WeekHours {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly weekStart: Day;
  readonly spheres: SphereHours[];
  /** Hours something was observed and no rule could say what they were for. */
  readonly unattributedHours: number;
}

type Row = typeof activityEvents.$inferSelect;

/**
 * What the person actually did, beside what the calendar planned.
 *
 * Observations are stored as they are posted; whose hours they are is worked out on every read
 * (`attribution.ts`), because the answer moves whenever a block is refiled or a place is given a
 * sphere. The calendar is read through `CalendarEventsService.resolve`, like everything else.
 */
export class ActivityService {
  constructor(private readonly userId: string) {}

  /** Writes a batch. Posting the same `externalId` again replaces the row, except a sphere a person chose. */
  async ingest(source: string, inputs: readonly ActivityInput[]): Promise<number> {
    if (source === "calendar") throw new ApiError("The calendar is read directly; it can't be posted as a source");
    const latest = [...new Map(inputs.map((input) => [input.externalId, input])).values()];
    if (latest.length === 0) return 0;
    for (const input of latest) {
      if (input.end <= input.start) throw new ApiError(`Event ${input.externalId}: end must be after start`);
    }
    if (latest.some((input) => input.sphereId)) {
      const known = new Set((await new CategoryService(this.userId).list()).map((sphere) => sphere.id));
      const stranger = latest.find((input) => input.sphereId && !known.has(input.sphereId));
      if (stranger) throw new ApiError(`Event ${stranger.externalId}: no sphere ${stranger.sphereId}`);
    }

    const manual = sql`${activityEvents.attribution} = 'manual'`;
    await db
      .insert(activityEvents)
      .values(
        latest.map((input) => ({
          userId: this.userId,
          source,
          externalId: input.externalId,
          kind: input.kind,
          startAt: input.start,
          endAt: input.end,
          place: input.place ?? null,
          sphereId: input.sphereId ?? null,
          attribution: input.sphereId ? "source" : null,
          confidence: input.confidence ?? 1,
          raw: input.raw ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [activityEvents.userId, activityEvents.source, activityEvents.externalId],
        set: {
          kind: sql`excluded.kind`,
          startAt: sql`excluded.start_at`,
          endAt: sql`excluded.end_at`,
          place: sql`excluded.place`,
          sphereId: sql`case when ${manual} then ${activityEvents.sphereId} else excluded.sphere_id end`,
          attribution: sql`case when ${manual} then ${activityEvents.attribution} else excluded.attribution end`,
          confidence: sql`excluded.confidence`,
          raw: sql`excluded.raw`,
          updatedAt: new Date(),
        },
      });
    return latest.length;
  }

  /** A person's own answer for one observation; null takes it back and lets the rules decide. */
  async override(id: string, sphereId: string | null): Promise<void> {
    if (sphereId) {
      const spheres = await new CategoryService(this.userId).list();
      if (!spheres.some((sphere) => sphere.id === sphereId)) throw new NotFoundError("No such sphere");
    }
    const written = await db
      .update(activityEvents)
      .set({ sphereId, attribution: sphereId ? "manual" : null })
      .where(and(eq(activityEvents.id, id), eq(activityEvents.userId, this.userId)))
      .returning({ id: activityEvents.id });
    if (written.length === 0) throw new NotFoundError("No such activity event");
  }

  /** Everything known about `[from, to)` that has already happened, and the lane it adds up to. */
  async timeline(from: Date, to: Date, now = new Date()): Promise<Timeline> {
    const until = new Date(Math.min(to.getTime(), now.getTime()));
    if (until <= from) {
      const range = await new CalendarEventsService(this.userId).resolve(from, to);
      return { connected: range.connected, needsReconnect: range.needsReconnect, events: [], segments: [] };
    }
    const { range, rows, rules } = await this.#read(from, until);
    const blocks = pastBlocks(range, until);
    const { segments } = attribute(rows.map(observedOf), blocks.map(blockOf), rules, {
      start: from.getTime(),
      end: until.getTime(),
    });

    const events: TimelineEvent[] = [
      ...rows.map((row) => {
        const claim = claimOf(observedOf(row), rules);
        return {
          id: row.id,
          source: row.source,
          kind: row.kind as ActivityKind,
          start: row.startAt.toISOString(),
          end: row.endAt.toISOString(),
          title: null,
          place: row.place,
          sphereId: claim?.sphereId ?? null,
          basis: claim?.basis ?? null,
          confidence: row.confidence,
        };
      }),
      ...blocks.map((event) => ({
        id: `calendar:${event.calendarId}:${event.id}`,
        source: "calendar",
        kind: "calendar" as const,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        title: event.title,
        place: event.location ? { label: event.location } : null,
        sphereId: [...event.weights].sort((a, b) => b.weightPercent - a.weightPercent)[0].categoryId,
        basis: "calendar" as const,
        confidence: 1,
      })),
    ].sort((a, b) => a.start.localeCompare(b.start));

    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      events,
      segments: segments.map((segment) => ({
        start: new Date(segment.start).toISOString(),
        end: new Date(segment.end).toISOString(),
        sphereId: segment.sphereId,
        basis: segment.basis,
      })),
    };
  }

  /** The week containing `day`: each sphere's target, what the calendar holds, and what was observed. */
  async hours(day: Day, timeZone: string, now = new Date()): Promise<WeekHours> {
    const weekStart = weekStartOf(day);
    const window = { start: rangeOf(weekStart, timeZone).start, end: rangeOf(addDays(weekStart, 6), timeZone).end };
    const [{ range, rows, rules }, spheres] = await Promise.all([
      this.#read(window.start, window.end),
      new CategoryService(this.userId).list(),
    ]);
    const parents = parentsOf(spheres);
    const span = { start: window.start.getTime(), end: window.end.getTime() };
    const counted = range.events.filter((event) => event.countsTowardHours && event.weights.length > 0).map(blockOf);
    const planned = hoursBySphere(counted, span, now.getTime(), parents);

    const until = Math.min(Math.max(now.getTime(), span.start), span.end);
    const observed = attribute(rows.map(observedOf), counted, rules, { start: span.start, end: until });
    const actual = hoursOf(observed.credits, parents);

    const row = (sphere: (typeof spheres)[number]): SphereHours => {
      const plan = planned.get(sphere.id);
      return {
        id: sphere.id,
        name: sphere.name,
        parentId: sphere.parentId,
        isBuffer: sphere.isBuffer,
        targetHours: Number(sphere.targetHoursPerWeek),
        plannedHours: toHours(((plan?.tracked ?? 0) + (plan?.scheduled ?? 0)) * 3_600_000),
        actualHours: actual.get(sphere.id) ?? 0,
      };
    };
    const ids = new Set(spheres.map((sphere) => sphere.id));
    const roots = spheres.filter((sphere) => !sphere.parentId || !ids.has(sphere.parentId));

    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      weekStart,
      spheres: roots.flatMap((root) => [row(root), ...spheres.filter((s) => s.parentId === root.id).map(row)]),
      unattributedHours: toHours(observed.unattributed),
    };
  }

  async #read(from: Date, to: Date): Promise<{ range: ResolvedCalendarRange; rows: Row[]; rules: PlaceRule[] }> {
    const [range, rows, preferences] = await Promise.all([
      new CalendarEventsService(this.userId).resolve(from, to),
      db.query.activityEvents.findMany({
        where: and(
          eq(activityEvents.userId, this.userId),
          lt(activityEvents.startAt, to),
          gt(activityEvents.endAt, from),
        ),
        orderBy: activityEvents.startAt,
      }),
      new PreferencesService(this.userId).get(),
    ]);
    const rules = preferences.travel.locations.flatMap((place) =>
      place.sphereId ? [{ ...place, sphereId: place.sphereId }] : [],
    );
    return { range, rows, rules };
  }
}

/** Blocks that have at least begun; the window's own end cuts off what is still ahead of now. */
function pastBlocks(range: ResolvedCalendarRange, until: Date) {
  return range.events.filter((event) => event.countsTowardHours && event.weights.length > 0 && event.start < until);
}

function blockOf(event: { start: Date; end: Date; weights: readonly { categoryId: string; weightPercent: number }[] }) {
  return { start: event.start.getTime(), end: event.end.getTime(), weights: event.weights };
}

function observedOf(row: Row) {
  return {
    start: row.startAt.getTime(),
    end: row.endAt.getTime(),
    sphereId: row.sphereId,
    attribution: row.attribution,
    confidence: row.confidence,
    place: row.place,
  };
}
