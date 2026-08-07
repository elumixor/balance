import { ApiError } from "../api-error";

/**
 * The stored grant is no longer usable — revoked by the user, expired (Google expires refresh
 * tokens after seven days while the consent screen is in testing), or missing a scope we now need.
 *
 * Deliberately not a 401: the app reads a 401 as a dead Clerk session and bounces to sign-in,
 * when what's actually needed is a reconnect of one integration.
 */
export class ProviderNeedsReconnectError extends ApiError {
  constructor(readonly provider: string) {
    super("Reconnect your calendar to keep it in sync", 409);
  }
}

/** The user asked for something that needs a calendar, and hasn't connected one. */
export class ProviderNotConnectedError extends ApiError {
  constructor(readonly provider: string) {
    super("No calendar is connected", 409);
  }
}
