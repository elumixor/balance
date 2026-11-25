import { z } from "zod";
import { ACTIVITY_KINDS, ActivityService } from "~/lib/activity/service";
import { keyed } from "~/lib/http/authed";
import { activitySourceField, parseInstantRange } from "~/lib/http/schemas";

/** One upload's worth; a source with more sends another batch. */
const MAX_EVENTS = 500;

const placeSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationId: z.string().min(1).max(64).optional(),
  wifi: z.string().min(1).max(64).optional(),
});

/**
 * What a device observed, a batch at a time. Idempotent by `source` and `externalId`: posting an
 * observation again replaces it, which is also how a stay still going on grows — the same id,
 * a later `end`. Takes an assistant key as well as a session, since what posts here is a
 * background uploader. See `docs/activity.md` for the contract.
 */
export default keyed(
  {
    body: {
      source: activitySourceField,
      events: z
        .array(
          z.object({
            externalId: z.string().min(1).max(200),
            kind: z.enum(ACTIVITY_KINDS),
            start: z.string(),
            end: z.string(),
            place: placeSchema.optional(),
            sphereId: z.string().uuid().optional(),
            confidence: z.number().min(0).max(1).optional(),
            raw: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .max(MAX_EVENTS),
    },
  },
  async ({ body, user }) => {
    const saved = await new ActivityService(user.id).ingest(
      body.source,
      body.events.map((event) => ({ ...event, ...parseInstantRange(event.start, event.end, ["start", "end"]) })),
    );
    return { ok: true as const, saved };
  },
);
