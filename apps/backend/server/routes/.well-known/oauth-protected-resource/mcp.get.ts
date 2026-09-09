import { eventHandler, getRequestURL, setResponseHeader } from "h3";
import { mcpOAuth } from "~/lib/mcp/oauth";

/**
 * RFC 9728, at the path a client probes for `/mcp` before it probes the root one.
 *
 * `resource` has to match the URL somebody typed into their assistant exactly, path and all —
 * a document saying the origin alone is a document the client refuses to use.
 */
export default eventHandler((event) => {
  setResponseHeader(event, "cache-control", "public, max-age=3600");
  return mcpOAuth.protectedResourceMetadata(getRequestURL(event).origin);
});
