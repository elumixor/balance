import { deviceGrantService } from "~/lib/auth/device-grants";
import { authed } from "~/lib/http/authed";

/**
 * Issues the grant the phone signs itself back in with. Called once a session exists, and again
 * whenever the app finds itself signed in without one — a device that lost its grant would
 * otherwise never get another until the next manual sign-in.
 */
export default authed(async ({ user }) => ({ token: await deviceGrantService.issue(user.id) }));
