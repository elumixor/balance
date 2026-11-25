import type { ActivityPlace } from "~/db/schema";
import type { Weight } from "~/lib/categories/tree";
import type { Span } from "~/lib/stats/overlap";

/**
 * Which sphere an observed stretch of time belongs to. Pure: observations, calendar blocks and
 * the places that name a sphere go in, and what comes out is the lane the calendar draws and the
 * milliseconds each sphere is owed.
 *
 * Four answers can be given about one moment, and they are heard in this order: a person's own
 * (`manual`), the source's (`source`), the calendar block that was running (`calendar`), and the
 * place the device was at (`place`). A place only speaks where nothing else did — being at home
 * says little about an hour the calendar already calls work.
 */

export type Basis = "manual" | "source" | "calendar" | "place";

/** Below this a source is guessing: the observation is still listed, but it claims no hours. */
export const MIN_CONFIDENCE = 0.5;
/** How near a saved place an observation has to be to be that place. */
export const PLACE_RADIUS_METERS = 150;

const RANK: Record<Basis, number> = { manual: 3, source: 2, calendar: 1, place: 0 };

export interface Observed extends Span {
  readonly sphereId: string | null;
  readonly attribution: string | null;
  readonly confidence: number;
  readonly place: ActivityPlace | null;
}

export interface CalendarBlock extends Span {
  readonly weights: readonly Weight[];
}

/** A saved place that counts as a sphere — Settings → Places. */
export interface PlaceRule {
  readonly id: string;
  readonly label: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly sphereId: string;
}

export interface Claim {
  readonly sphereId: string;
  readonly basis: Basis;
}

/** A stretch of the lane: one sphere, and who said so. */
export interface Segment extends Span, Claim {}

export interface Attribution {
  readonly segments: Segment[];
  /** Milliseconds per sphere, by the sphere named — a part's are not yet its parent's. */
  readonly credits: Map<string, number>;
  /** Observed time no rule could put anywhere. */
  readonly unattributed: number;
}

/** The sphere a place stands for: by the saved place's id, then by distance, then by name. */
export function sphereForPlace(place: ActivityPlace | null, rules: readonly PlaceRule[]): string | null {
  if (!place) return null;
  const byId = rules.find((rule) => rule.id === place.locationId);
  if (byId) return byId.sphereId;

  const { latitude, longitude } = place;
  if (latitude !== undefined && longitude !== undefined) {
    const near = rules
      .flatMap((rule) =>
        rule.latitude === undefined || rule.longitude === undefined
          ? []
          : [{ rule, meters: metersBetween(latitude, longitude, rule.latitude, rule.longitude) }],
      )
      .filter((hit) => hit.meters <= PLACE_RADIUS_METERS)
      .sort((a, b) => a.meters - b.meters)[0];
    if (near) return near.rule.sphereId;
  }

  const label = place.label?.trim().toLowerCase();
  return (label && rules.find((rule) => rule.label.trim().toLowerCase() === label)?.sphereId) || null;
}

/** What an observation says about itself, before the calendar is asked. */
export function claimOf(observed: Observed, rules: readonly PlaceRule[]): Claim | null {
  if (observed.sphereId && observed.attribution === "manual") return { sphereId: observed.sphereId, basis: "manual" };
  if (observed.confidence < MIN_CONFIDENCE) return null;
  if (observed.sphereId) return { sphereId: observed.sphereId, basis: "source" };
  const sphereId = sphereForPlace(observed.place, rules);
  return sphereId ? { sphereId, basis: "place" } : null;
}

/**
 * The window cut wherever anything starts or stops, and each cut given to whoever ranks highest
 * in it. Calendar blocks running together share the time equally, as they do on the ring; of two
 * observations with the same standing the shorter one wins — the gym visit inside the day at
 * home — and equal ones share.
 */
export function attribute(
  observed: readonly Observed[],
  blocks: readonly CalendarBlock[],
  rules: readonly PlaceRule[],
  window: Span,
): Attribution {
  const clip = (span: Span) => ({ start: Math.max(span.start, window.start), end: Math.min(span.end, window.end) });
  const seen = observed.map((item) => ({ ...clip(item), length: item.end - item.start, claim: claimOf(item, rules) }));
  const counted = blocks.filter((block) => block.weights.length > 0).map((block) => ({ ...clip(block), block }));
  const edges = [
    ...new Set([...seen, ...counted].filter((span) => span.end > span.start).flatMap((span) => [span.start, span.end])),
  ].sort((a, b) => a - b);

  const credits = new Map<string, number>();
  const segments: Segment[] = [];
  let unattributed = 0;

  for (let i = 0; i + 1 < edges.length; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    const running = <T extends Span>(spans: readonly T[]) => spans.filter((s) => s.start <= start && s.end >= end);
    const here = running(seen);
    const claims = here.flatMap((item) => (item.claim ? [{ ...item.claim, length: item.length }] : []));
    const calendar = running(counted);
    const top = Math.max(-1, ...claims.map((claim) => RANK[claim.basis]), calendar.length > 0 ? RANK.calendar : -1);

    if (top < 0) {
      if (here.length > 0) unattributed += end - start;
      continue;
    }

    const shares = new Map<string, number>();
    const give = (sphereId: string, ms: number) => shares.set(sphereId, (shares.get(sphereId) ?? 0) + ms);
    let basis: Basis = "calendar";
    if (top === RANK.calendar) {
      for (const { block } of calendar) {
        for (const weight of block.weights) {
          give(weight.categoryId, ((end - start) / calendar.length) * (weight.weightPercent / 100));
        }
      }
    } else {
      const ranked = claims.filter((claim) => RANK[claim.basis] === top);
      const shortest = Math.min(...ranked.map((claim) => claim.length));
      const winners = ranked.filter((claim) => claim.length === shortest);
      basis = winners[0].basis;
      for (const winner of winners) give(winner.sphereId, (end - start) / winners.length);
    }

    for (const [sphereId, ms] of shares) credits.set(sphereId, (credits.get(sphereId) ?? 0) + ms);
    const sphereId = [...shares].sort((a, b) => b[1] - a[1])[0][0];
    const last = segments.at(-1);
    if (last && last.end === start && last.sphereId === sphereId && last.basis === basis) {
      segments[segments.length - 1] = { ...last, end };
    } else {
      segments.push({ start, end, sphereId, basis });
    }
  }

  return { segments, credits, unattributed };
}

/** Credits as hours, a part's counted for its parent too — the way every other total here is. */
export function hoursOf(
  credits: ReadonlyMap<string, number>,
  parents: ReadonlyMap<string, string>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [sphereId, ms] of credits) {
    totals.set(sphereId, (totals.get(sphereId) ?? 0) + ms);
    const parent = parents.get(sphereId);
    if (parent) totals.set(parent, (totals.get(parent) ?? 0) + ms);
  }
  return new Map([...totals].map(([id, ms]) => [id, toHours(ms)]));
}

export function toHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** Great-circle distance; at 150 metres the haversine is far more than enough. */
function metersBetween(latA: number, lonA: number, latB: number, lonB: number): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(rad(latB - latA) / 2) ** 2 +
    Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(rad(lonB - lonA) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}
