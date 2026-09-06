import { ProviderNeedsReconnectError } from "~/lib/calendar/errors";
import type { ProviderAccountService } from "~/lib/calendar/provider-accounts";
import { ApiError, ConflictError, NotFoundError, UpstreamError } from "~/lib/http/api-error";
import type { GoogleErrorResponse } from "./api-types";

const BASE_URL = "https://www.googleapis.com/calendar/v3";
const RATE_LIMIT_RETRY_MS = 500;
const RATE_LIMITED = 503;
const NO_CONTENT = 204;

export interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  /** A delete of something already gone is a success, not a 404. */
  readonly allowGone?: boolean;
}

/**
 * Google's answers to "no": which are worth one more try, and what the rest mean in words.
 * Two retries are kept apart on purpose — a token refreshed on a 401 must not spend the one
 * back-off a 429 is allowed, or the other way round.
 */
interface Attempt {
  readonly refreshed: boolean;
  readonly backedOff: boolean;
}

const FIRST_ATTEMPT: Attempt = { refreshed: false, backedOff: false };

/** The HTTP transport to the Calendar API for one connected account, with its retry policy. */
export class GoogleRequest {
  constructor(
    private readonly accounts: ProviderAccountService,
    private readonly accountId: string,
    private readonly providerName: string,
  ) {}

  async send<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.#attempt<T>(path, options, FIRST_ATTEMPT);
  }

  async #attempt<T>(path: string, options: RequestOptions, attempt: Attempt): Promise<T> {
    const token = await this.accounts.accessToken(this.accountId);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    if (response.ok) return response.status === NO_CONTENT ? (undefined as T) : ((await response.json()) as T);
    if (options.allowGone && (response.status === 404 || response.status === 410)) return undefined as T;

    const body = (await response.json().catch(() => ({}))) as GoogleErrorResponse;
    const reason = body.error?.errors?.[0]?.reason ?? "";

    // An access token can also die before its stated expiry — the account being re-granted,
    // for instance — so one forced refresh is worth trying before giving up on the connection.
    if (response.status === 401 && !attempt.refreshed) {
      const account = await this.accounts.getById(this.accountId);
      if (account) await this.accounts.refreshAccessToken(account);
      return this.#attempt<T>(path, options, { ...attempt, refreshed: true });
    }
    if (response.status === 401 || reason === "insufficientPermissions") {
      throw new ProviderNeedsReconnectError(this.providerName);
    }
    if ((response.status === 403 && reason.includes("ateLimit")) || response.status === 429) {
      if (attempt.backedOff) {
        throw new ApiError("Google Calendar is rate-limiting us — try again in a moment", RATE_LIMITED);
      }
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
      return this.#attempt<T>(path, options, { ...attempt, backedOff: true });
    }
    if (response.status === 404) throw new NotFoundError("That event no longer exists in Google Calendar");
    // The screens hide the handles on an event that can't be changed, so this is the answer to a
    // stale week — the organizer closed it since the last read — said in words rather than a 502.
    if (response.status === 403 && reason === "forbiddenForNonOrganizer") {
      throw new ConflictError("Only the organizer can change that event");
    }
    if (response.status === 403 && reason === "requiredAccessLevel") {
      throw new ConflictError("You can only read that calendar, so its events can't be changed");
    }

    // Named in full — the request too — because "Bad Request" alone says nothing about which write.
    const said = body.error?.message ?? body.error?.errors?.[0]?.message ?? response.statusText;
    const detail = [reason, `${options.method ?? "GET"} ${path.split("?")[0]}`].filter(Boolean).join(", ");
    throw new UpstreamError(`Google Calendar said: ${said} (${detail})`);
  }
}
