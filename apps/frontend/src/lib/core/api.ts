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
 * How long a request — or the token minted for it — is allowed to take before it counts as lost.
 *
 * There has to be a limit, because a request that never answers is worse than one that fails: the
 * caches and the write queue both mark themselves busy while a request is out and clear it when
 * the answer lands, so a promise that never settles leaves a spinner turning for the rest of the
 * session and nothing ever tries again. iOS suspends the webview mid-request often enough that
 * this is the ordinary case, not the exotic one.
 */
const REQUEST_TIMEOUT_MS = 20_000;

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
  if (!token) throw new ApiClientError("Not authenticated");

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(input, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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
 * Narrows a response typed as `T | { error: string }` down to `T`. The `{ error }` branch only
 * exists because the generated client's response type is inferred from the route handler's
 * return type, which includes its error path — at runtime that path always comes back as a
 * non-OK HTTP response, so `callApi` throws before this ever sees `{ error }`.
 */
export function unwrapOk<T extends object>(response: T | { error: string }): T {
  if ("error" in response) throw new ApiClientError(response.error);
  return response;
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
  const body = await res.text().catch(() => "");
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
  const text = await response.text().catch(() => "");
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
