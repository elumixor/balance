import { z } from "zod";
import { eventCache } from "~/lib/calendar/event-cache";
import { splitCalendarId } from "~/lib/calendar/ids";
import { authed } from "~/lib/http/authed";
import { integrationSourceField } from "~/lib/http/schemas";
import { IntegrationRecordService } from "~/lib/integrations/records-service";

/** One sync's worth; a fortnight of nights is well under it. */
const MAX_RECORDS = 100;

/**
 * What an integration on the device observed for occurrences of the events it is linked to. The
 * server keeps them and hangs each off its occurrence; what they contain is the feed's business.
 */
export default authed(
  {
    body: {
      source: integrationSourceField,
      records: z
        .array(
          z.object({
            calendarId: z.string().min(1),
            externalEventId: z.string().min(1),
            data: z.record(z.string(), z.unknown()),
          }),
        )
        .max(MAX_RECORDS),
    },
  },
  async ({ body, user }) => {
    await new IntegrationRecordService(user.id).upsertMany(
      body.source,
      body.records.map((record) => ({ ...record, calendarId: splitCalendarId(record.calendarId).calendarId })),
    );
    // A record hangs off its event in every read, so the memo of the week has to go.
    eventCache.invalidate(user.id);
    return { ok: true as const, saved: body.records.length };
  },
);
