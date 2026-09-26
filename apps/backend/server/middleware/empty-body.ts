import { defineEventHandler, readRawBody } from "h3";

/** Where h3 keeps a parsed body, so every later `readBody` is answered from it. */
const PARSED_BODY = Symbol.for("h3ParsedBody");
const PAYLOAD_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A request with no body at all is read as an empty object.
 *
 * A route whose fields are all optional still validates its body as an object, and h3 reads an
 * absent body as `undefined` — so `POST /mobile/tracking/stop` from a watch build that sent nothing
 * was refused with "expected object, received undefined", and the timer it was stopping could never
 * be stopped. Nothing any route does with a missing body differs from what it does with `{}`.
 */
export default defineEventHandler(async (event) => {
  if (!PAYLOAD_METHODS.has(event.method)) return;
  const raw = await readRawBody(event);
  if (raw === undefined || raw.trim() === "") {
    (event.node.req as unknown as Record<symbol, unknown>)[PARSED_BODY] = {};
  }
});
