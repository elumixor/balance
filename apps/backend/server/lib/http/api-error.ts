/**
 * An answer the API gives on purpose — "that day is already planned", "reconnect your calendar" —
 * as opposed to a crash. The message is written for the person reading it and is sent through
 * as-is; the status says how the client should take it.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** No usable session. The app reads this one status as "sign in again", so nothing else uses it. */
export class NotAuthenticatedError extends ApiError {
  constructor(message = "Not authenticated") {
    super(message, 401);
    this.name = "NotAuthenticatedError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

/** The request made sense, but the world has moved on since it was composed. */
export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409);
    this.name = "ConflictError";
  }
}

/** Something upstream — Google, mostly — answered in a way that can't be worked with. */
export class UpstreamError extends ApiError {
  constructor(message: string) {
    super(message, 502);
    this.name = "UpstreamError";
  }
}
