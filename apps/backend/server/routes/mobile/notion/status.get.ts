import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Every granted workspace, and what the last run of each did. Never a 401 — see the service. */
export default authed(async ({ user }) => new NotionService(user.id).status());
