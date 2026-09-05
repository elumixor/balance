import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import {
  cardSchema,
  integrationsSchema,
  PreferencesService,
  remindersSchema,
  sessionsSchema,
  travelSchema,
  zonesSchema,
} from "../../../lib/preferences-service";

/**
 * One setting at a time. The panel has no Save button — every switch writes as it is flipped —
 * so a patch carries the one thing that changed and the rest is left where it was.
 */
export default handler(
  {
    body: {
      reminders: remindersSchema.partial().optional(),
      travel: travelSchema.partial().optional(),
      sessions: sessionsSchema.partial().optional(),
      zones: zonesSchema.partial().optional(),
      card: cardSchema.partial().optional(),
      integrations: integrationsSchema.partial().optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      return await new PreferencesService(user.id).update(body);
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
