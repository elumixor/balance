import { setResponseHeader } from "h3";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/**
 * One run of the mirror, asked for by the projects screen when it opens and by the settings row's
 * button. A refused token comes back as a status saying so rather than as an error: the screen
 * has rows to draw either way.
 */
export default authed(async ({ event, user }) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  return new NotionService(user.id).sync();
});
