import { auth } from "$lib/account/auth.svelte";
import { NitroAPI } from "$lib/api-client";
import { API_BASE_URL, apiBaseUrlProblem } from "./env";

export { API_BASE_URL };

/** A request that failed. `status` is set when the server answered; unset when it never did. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  /** The server understood and said no, rather than being unreachable or broken. */
  get rejected() {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }
}

/**
 * No session yet, or none any more — which is a state the app moves through, not a failure.
 *
 * A launch draws the shell before Clerk has replayed anything, and every screen under it asks for
 * its data on mount, so a device whose session has gone used to answer three "Not authenticated"
 * cards in the corner on the way to the sign-in screen — and they were still sitting there over
 * the calendar once the person had signed in. Nothing is reported for one of these: the caches
 * stay unfetched, and the pass that runs when a session arrives fetches them.
 */
export class NotSignedInError extends ApiClientError {
  constructor() {
    super("Not authenticated");
    this.name = "NotSignedInError";
  }
}

/**
 * How long a request — or the token minted for it — is allowed to take before it counts as lost.
 *
 * There has to be a limit, because a request that never answers is worse than one that fails: the
 * caches and the write queue both mark themselves busy while a request is out and clear it when
 * the answer lands, so a promise that never settles leaves a spinner turning for the rest of the
 * session and nothing ever tries again. iOS suspends the webview mid-request often enough that
 * this is the ordinary case, not the exotic one.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The requests whose answer is a whole run of somebody else's API — a Notion workspace read page
 * by page under its rate limit, a model asked about a week of events — get longer. Twenty seconds
 * was cutting the mirror off while the server was still writing it, and the card in the corner
 * blamed the connection for a sync that went on to succeed.
 */
const SLOW_REQUEST_TIMEOUT_MS = 120_000;
const SLOW_PATHS = [
  "/mobile/notion/sync",
  "/mobile/notion/link",
  "/mobile/calendar/classify",
  "/mobile/projects/assist/",
];

function timeoutFor(input: Parameters<typeof fetch>[0]) {
  const path = describe(input);
  return SLOW_PATHS.some((slow) => path.includes(slow)) ? SLOW_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/** Rejects rather than hangs, so a caller waiting on this always gets an answer of some kind. */
async function withTimeout<T>(promise: Promise<T>, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiClientError(message)), REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function authenticatedFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  // A build that doesn't know where its backend is can only fail one request at a time, forever,
  // with a different-looking message each time. Say the real thing instead, before going out.
  if (apiBaseUrlProblem) throw new ApiClientError(apiBaseUrlProblem);

  // Clerk refreshes the session token over the network, so this hangs for the same reasons a
  // request does — and a request that never gets its token never even starts.
  const token = await withTimeout(auth.token(), "Can't reach the server. Check your connection and try again.");
  if (!token) throw new NotSignedInError();

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(input, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(timeoutFor(input)) });
  } catch (e) {
    // A transport failure (offline, DNS, server down) surfaces as `TypeError: Failed to fetch`,
    // and a timeout as an `AbortError` — neither means anything to the person holding the phone.
    // What it was trying to reach does mean something to whoever is asked about it later.
    throw new ApiClientError(
      `Can't reach the server. Check your connection and try again.\n(${describe(input)} — ${
        e instanceof Error ? e.message : String(e)
      })`,
    );
  }
}

export const api = new NitroAPI({ baseUrl: API_BASE_URL, fetch: authenticatedFetch }).mobile;

/**
 * The generated client throws a generic `Error("API error {status}: {rawBody}")` on non-OK
 * responses. Unwraps that back into the clean `{ error }` message the backend actually sent,
 * so screens that surface `e.message` keep showing the same copy.
 */
export async function callApi<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof Error) {
      const match = e.message.match(/^API error (\d+): (.*)$/s);
      if (match) {
        const status = Number(match[1]);
        const parsed = safeJsonParse(match[2]);
        if (parsed && typeof parsed === "object" && "error" in parsed) {
          throw new ApiClientError(String((parsed as { error: unknown }).error), status);
        }
        // Non-JSON body (gateway HTML, empty 500, or — on a native build with the wrong base URL —
        // the app's own index.html) — the raw text is noise, its shape is not.
        throw new ApiClientError(serverProblem(status, match[2]), status);
      }
    }
    throw e;
  }
}

/** A body that isn't JSON is `null` here; every caller treats that as "not the API's answer". */
function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The generated client (`@elumixor/nitro-client@4.0.6`) doesn't wire query-string params into
 * `$get()` calls — only path segments and request bodies. This raw-fetch helper covers the two
 * endpoints that need query params (`/entries?limit=`, `/stats?period=&date=`) until that's fixed
 * upstream. Reuses the same base URL/auth as the typed client for a single source of truth.
 */
export async function apiGet<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const url = `${API_BASE_URL}/mobile${path}${suffix}`;

  const res = await authenticatedFetch(url);
  const body = await readBody(res, url);
  const json = safeJsonParse(body);

  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : serverProblem(res.status, body);
    throw new ApiClientError(message, res.status);
  }
  // An OK response that isn't JSON is not data — and used to be handed on as `null`, which every
  // screen then read fields off as though the request had worked. The commonest cause is a base
  // URL pointing at something that isn't the API, which the shape of the body gives away.
  if (json === null || typeof json !== "object") throw new ApiClientError(notTheApi(url, body));
  return json as T;
}

/**
 * A request that carries no session — signing in is exactly what has no token yet, and a device
 * grant needs none. Everything else goes through the typed client.
 */
export async function postPublic<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const url = `${API_BASE_URL}/mobile${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await readBody(response, url);
  const json = safeJsonParse(text);
  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : serverProblem(response.status, text);
    throw new ApiClientError(message, response.status);
  }
  if (json === null || typeof json !== "object") throw new ApiClientError(notTheApi(url, text));
  return json as T;
}

/**
 * The body, or a transport failure when it stops arriving. Headers can land and the body never
 * follow — the Mac sleeps mid-request and the timeout aborts the stream on wake — and reading that
 * as an empty body used to blame the API address for what was a dropped connection.
 */
async function readBody(response: Response, url: string) {
  try {
    return await response.text();
  } catch (e) {
    throw new ApiClientError(
      `Can't reach the server. Check your connection and try again.\n(${url} — ${e instanceof Error ? e.message : String(e)})`,
    );
  }
}

/** What a non-JSON body means, said in one sentence rather than dumped. */
function serverProblem(status: number, body: string) {
  if (looksLikeHtml(body)) return `The address the app is using isn't the API — it answered ${status} with a web page.`;
  return `The server had a problem (${status}). Try again in a moment.`;
}

function notTheApi(url: string, body: string) {
  const what = looksLikeHtml(body) ? "a web page" : `${body.slice(0, 60) || "nothing"}…`;
  return `The app asked ${url} for data and got ${what}. Its API address is probably wrong.`;
}

function looksLikeHtml(body: string) {
  return /^\s*(<!doctype html|<html)/i.test(body);
}

function describe(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
