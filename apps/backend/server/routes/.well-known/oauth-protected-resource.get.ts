import { eventHandler, getRequestURL, setResponseHeader } from "h3";
import { mcpOAuth } from "~/lib/mcp/oauth";

/** The same document at the root path, for a client that probes there first. */
export default eventHandler((event) => {
  setResponseHeader(event, "cache-control", "public, max-age=3600");
  return mcpOAuth.protectedResourceMetadata(getRequestURL(event).origin);
});
