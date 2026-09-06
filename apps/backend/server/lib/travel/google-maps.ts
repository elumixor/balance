import { UpstreamError } from "~/lib/http/api-error";
import { captureError } from "~/lib/telemetry";

/**
 * How a "no" from any of the Maps APIs is read.
 *
 * An address Google can't place, or a journey it won't route, is a normal answer for a calendar
 * event whose location is "Room 4" — the app shows nothing rather than an error. A key that isn't
 * allowed to ask — no billing on the project, the wrong restriction — is the same outcome for the
 * person looking at a calendar, so it reads as one too; but it is a configuration problem, and it
 * is reported so it doesn't stay invisible until somebody wonders why no journey ever has a time.
 */
const NOT_FOUND_STATUSES = new Set([400, 404]);
const MISCONFIGURED_STATUSES = new Set([401, 403]);

/** True when the answer is "nothing here"; throws when Google is actually down. */
export async function isNoAnswer(response: Response, api: string): Promise<boolean> {
  if (NOT_FOUND_STATUSES.has(response.status)) return true;
  if (MISCONFIGURED_STATUSES.has(response.status)) {
    await captureError(new Error(`${api} refused the maps key: ${response.status} ${response.statusText}`), {
      path: api,
      status: response.status,
    });
    return true;
  }
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  throw new UpstreamError(`Google Maps said: ${body.error?.message ?? response.statusText}`);
}
