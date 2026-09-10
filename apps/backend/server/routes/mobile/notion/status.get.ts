import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Whether a workspace is mirrored, and what the last run of it did. Never a 401 — see the service. */
export default authed(async ({ user }) => new NotionService(user.id).status());
