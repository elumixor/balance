import { eventHandler, getRequestURL, setResponseHeader } from "h3";
import { mcpOAuth } from "~/lib/mcp/oauth";

/** RFC 8414: where to send the person, where to bring the code back, and how to register. */
export default eventHandler((event) => {
  setResponseHeader(event, "cache-control", "public, max-age=3600");
  return mcpOAuth.authorizationServerMetadata(getRequestURL(event).origin);
});
