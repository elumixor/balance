import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Everything the grant can see, so the one question left after connecting is a list, not a URL. */
export default authed(async ({ user }) => ({ databases: await new NotionService(user.id).dataSources() }));
