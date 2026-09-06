import { authed } from "~/lib/http/authed";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/** What the watch asks on every wake: is a timer running, and what is it pointed at. */
export default authed(async ({ user }) => ({ active: await new TrackingSessionsService(user.id).current() }));
