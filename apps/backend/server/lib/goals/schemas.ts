import { z } from "zod";
import { activitySourceField, dayField, timeZoneField } from "~/lib/http/schemas";
import { AGGREGATES, CADENCES } from "./ladder";
import { GOAL_SCOPES } from "./tokens";

const MAX_LEVELS = 20;
const MAX_RUN = 30;
const slug = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, "must be a slug like meditation-daily");

/** The fields of a goal as a client sends them; `POST` takes them whole, `PATCH` any of them. */
export const goalFields = {
  title: z.string().trim().min(1).max(120),
  kind: slug,
  metric: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, "must be a key like minutes"),
  aggregate: z.enum(AGGREGATES).optional(),
  cadence: z.enum(CADENCES).optional(),
  timeZone: timeZoneField,
  levels: z
    .array(z.object({ target: z.number().positive(), label: z.string().trim().min(1).max(60).optional() }))
    .min(1)
    .max(MAX_LEVELS),
  advanceAfter: z.number().int().min(1).max(MAX_RUN).optional(),
  easeAfter: z.number().int().min(1).max(MAX_RUN).optional(),
  sphereId: z.string().uuid().nullable().optional(),
};

export const goalKeyField = slug;
export const goalStartField = dayField.optional();
export const goalSourceField = activitySourceField;
export const goalScopesField = z.array(z.enum(GOAL_SCOPES)).min(1);

/** One entry of a progress batch. `metrics` holds numbers a target can be measured on and any detail beside them. */
export const progressEntrySchema = z.object({
  goal: z.string().min(1).max(64),
  externalId: z.string().min(1).max(200),
  at: z.string(),
  metrics: z.record(z.string().max(60), z.union([z.number(), z.string().max(500), z.boolean(), z.null()])),
});
