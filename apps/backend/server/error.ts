import type { H3Event } from "h3";
import { send, setResponseHeader, setResponseStatus } from "h3";
import { ApiError } from "./lib/api-error";

/**
 * Nitro treats anything it didn't create itself as unhandled and replaces the message with
 * "Server Error", so a failed auth check reached the app as an opaque body it could only render as
 * "something went wrong". Every `ApiError` the API throws carries a message written for the person
 * reading it, so send that through in the `{ error }` shape the client already parses. Anything
 * else falls through to Nitro's default handler, which is right to stay vague.
 */
export default async function errorHandler(error: Error & { cause?: unknown }, event: H3Event) {
  const apiError = [error, error.cause].find((e): e is ApiError => e instanceof ApiError);
  if (!apiError) return;

  setResponseStatus(event, apiError.status);
  setResponseHeader(event, "content-type", "application/json");
  await send(event, JSON.stringify({ error: apiError.message }));
}
