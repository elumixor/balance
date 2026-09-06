import { authed } from "~/lib/http/authed";
import { preferencesPatchFields } from "~/lib/preferences/schema";
import { PreferencesService } from "~/lib/preferences/service";

/**
 * One setting at a time. The panel has no Save button — every switch writes as it is flipped —
 * so a patch carries the one thing that changed and the rest is left where it was.
 */
export default authed({ body: preferencesPatchFields }, async ({ body, user }) =>
  new PreferencesService(user.id).update(body),
);
