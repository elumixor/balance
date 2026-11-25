import { z } from "zod";
import { ActivityService } from "~/lib/activity/service";
import { keyed } from "~/lib/http/authed";

/**
 * A person's own answer about one observation: the sphere those hours were. It outranks the
 * source, the calendar and the place, and survives the source posting the observation again;
 * null takes it back.
 */
export default keyed({ body: { sphereId: z.string().uuid().nullable() } }, async ({ body, router, user }) => {
  await new ActivityService(user.id).override(router.id, body.sphereId);
  return { ok: true as const };
});
