import type { H3Event } from "h3";
import { setResponseStatus } from "h3";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Maps a thrown ApiError/Error to the `{ error }` JSON shape + status code the frontend expects. */
export function handleApiError(event: H3Event, e: unknown) {
  const status = e instanceof ApiError ? e.status : 400;
  setResponseStatus(event, status);
  return { error: e instanceof Error ? e.message : "Unknown error" };
}
