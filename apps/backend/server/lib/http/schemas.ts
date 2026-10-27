import { z } from "zod";
import { ApiError } from "./api-error";

/** A plain `YYYY-MM-DD` — a day in a place, never an instant. */
export const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a day like 2026-09-06");

/** An IANA zone name as the device reports it. Long enough for "America/Argentina/Buenos_Aires". */
export const timeZoneField = z.string().max(64);

/** A `[from, to)` range of instants, as two ISO 8601 strings that have to make sense together. */
export function parseInstantRange(from: string, to: string, names: [string, string] = ["from", "to"]) {
  const start = parseInstant(from, names[0]);
  const end = parseInstant(to, names[1]);
  if (end <= start) throw new ApiError(`${names[1]} must be after ${names[0]}`);
  return { start, end };
}

export function parseInstant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(`${field} must be a valid ISO 8601 instant`);
  return parsed;
}

/** An integration feed's name — "apple-health:sleep": the integration, then the feed under it. */
export const integrationSourceField = z.string().regex(/^[a-z][a-z0-9-]{1,40}:[a-z][a-z0-9-]{1,40}$/);

/**
 * A pointer to a record in another app — `kip:page/<uuid>` names a Kip task. Only the shape is
 * checked: the scheme, a colon, and something after it. What it names is never read here.
 */
export const urnField = z
  .string()
  .trim()
  .max(512)
  .regex(/^[a-z][a-z0-9-]*:.+$/, "must be a URN like kip:page/<id>");
