import { authed } from "~/lib/http/authed";
import { PeopleService } from "~/lib/people/service";

/**
 * Fills the list of people from the guest lists of recent events. Asked for once a session, and
 * a second pass adds nobody twice; the rows themselves arrive through `/mobile/sync`.
 */
export default authed(async ({ user }) => new PeopleService(user.id).seed());
