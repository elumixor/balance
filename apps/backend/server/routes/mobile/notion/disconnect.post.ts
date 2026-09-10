import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** The grant goes; what it mirrored stays, because those projects are the app's records now. */
export default authed(async ({ user }) => new NotionService(user.id).disconnect());
