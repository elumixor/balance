import { CalendarPrefsService } from "~/lib/calendar/prefs-service";
import { authed } from "~/lib/http/authed";

/** Fetched only when the picker is opened or the app starts — not on every week. */
export default authed(async ({ user }) => new CalendarPrefsService(user.id).accounts());
