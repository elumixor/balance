import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { eventCache } from "../../../../lib/calendar/event-cache";
import { splitCalendarId } from "../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { IntegrationRecordService } from "../../../../lib/integrations/records-service";

/**
 * What an integration on the device observed for occurrences of the events it is linked to. The
 * server keeps them and hangs each off its occurrence; what they contain is the feed's business.
 */
export default handler(
  {
    body: {
      source: z.string().regex(/^[a-z][a-z0-9-]{1,40}:[a-z][a-z0-9-]{1,40}$/),
      records: z
        .array(
          z.object({
            calendarId: z.string().min(1),
            externalEventId: z.string().min(1),
            data: z.record(z.string(), z.unknown()),
          }),
        )
        .max(100),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      await new IntegrationRecordService(user.id).upsertMany(
        body.source,
        body.records.map((record) => ({ ...record, calendarId: splitCalendarId(record.calendarId).calendarId })),
      );
      eventCache.invalidate(user.id);
      return { ok: true as const, saved: body.records.length };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
