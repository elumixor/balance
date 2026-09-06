import { type H3Event, isError, send, setResponseHeader, setResponseStatus } from "h3";
import { ApiError } from "~/lib/http/api-error";
import { captureError } from "~/lib/telemetry";

/**
 * The one place an error becomes a response.
 *
 * An `ApiError` is an answer — "reconnect your calendar", "that day is already planned" — written
 * for the person reading it, and goes through with its status. A request h3 refused before the
 * route ran (a body that failed its schema) is the same kind of thing, said in the schema's own
 * words. Everything else got here by surprise: it is reported, because this is the only place
 * that sees it, and answered with a sentence that gives nothing away — a stack trace is for
 * Sentry, not for a screen.
 *
 * Every branch sends, so Nitro's own handler — which answers "Server Error" and nothing else —
 * never gets a turn.
 */

const INTERNAL_ERROR = 500;
const INTERNAL_MESSAGE = "Something went wrong on our side";

export default async function errorHandler(error: Error & { cause?: unknown }, event: H3Event) {
  const { status, message } = await describe(error, event);
  setResponseStatus(event, status);
  setResponseHeader(event, "content-type", "application/json");
  await send(event, JSON.stringify({ error: message }));
}

async function describe(error: Error & { cause?: unknown }, event: H3Event) {
  const apiError = [error, error.cause].find((e): e is ApiError => e instanceof ApiError);
  if (apiError) return { status: apiError.status, message: apiError.message };

  if (isError(error) && error.statusCode < INTERNAL_ERROR) {
    return { status: error.statusCode, message: validationMessage(error.data) ?? error.message };
  }

  await captureError(error, { path: event.path, method: event.method, status: INTERNAL_ERROR });
  return { status: INTERNAL_ERROR, message: INTERNAL_MESSAGE };
}

/**
 * `readValidatedBody` hands the zod error over as `data`. Its first issue, with the field it is
 * about, is the sentence a person can act on; the raw error is a wall of JSON.
 */
function validationMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("issues" in data) || !Array.isArray(data.issues)) return null;
  const issue = data.issues[0] as { path?: (string | number)[]; message?: string } | undefined;
  if (!issue?.message) return null;
  const path = issue.path?.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
