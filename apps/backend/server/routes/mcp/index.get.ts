import { eventHandler, setResponseHeader, setResponseStatus } from "h3";

/**
 * A stateless server has nothing to push, so there is no stream to open. The spec's own answer to
 * that is 405 rather than an empty `text/event-stream`, and the official example does the same.
 */
export default eventHandler((event) => {
  setResponseStatus(event, 405);
  setResponseHeader(event, "allow", "POST");
  return { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null };
});
