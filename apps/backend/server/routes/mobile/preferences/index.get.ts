import { authed } from "~/lib/http/authed";
import { PreferencesService } from "~/lib/preferences/service";

/** How this account wants to be reminded, and how it gets around. */
export default authed(async ({ user }) => new PreferencesService(user.id).get());
