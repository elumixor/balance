import { eventHandler, setResponseHeader, setResponseStatus } from "h3";

/** DELETE ends a session, and there are none — see `index.get.ts`. */
export default eventHandler((event) => {
  setResponseStatus(event, 405);
  setResponseHeader(event, "allow", "POST");
  return { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null };
});
