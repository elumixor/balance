import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { SpanSyncService } from "../../../../lib/integrations/spans-service";

/** A sync can't be allowed to fan out into hundreds of Google writes because a device replayed a year. */
const MAX_SPANS = 200;

const instant = z.string().transform((value, ctx) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) ctx.addIssue({ code: "custom", message: "not an ISO 8601 instant" });
  return date;
});

/**
 * Spans an integration on the device observed — nights from Apple Health, say — written into the
 * calendar as that integration's own events. The device reads the source, because the source is
 * only readable there; the server owns the matching against what was written before.
 */
export default handler(
  {
    body: {
      source: z.string().regex(/^[a-z][a-z0-9-]{1,40}(:[a-z][a-z0-9-]{1,40})?$/),
      from: instant,
      to: instant,
      spans: z.array(z.object({ start: instant, end: instant })).max(MAX_SPANS),
      title: z.string().trim().min(1).max(200),
      categoryId: z.string().min(1),
      calendarId: z.string().optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      if (body.to <= body.from) throw new ApiError("The window has to end after it starts");
      for (const span of body.spans) {
        if (span.end <= span.start) throw new ApiError("A span has to end after it starts");
        if (span.start < body.from || span.end > body.to) throw new ApiError("Every span has to sit inside the window");
      }
      const result = await new SpanSyncService(user.id).sync(body);
      return { result };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
