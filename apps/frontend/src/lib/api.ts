import { NitroAPI } from "./api-client";
import { auth } from "./auth.svelte";

/**
 * Empty on a release web build: the app is served by the same Nitro deployment that owns
 * `/mobile/*`, so a relative base keeps requests same-origin (no CORS preflight). Dev servers
 * and native builds get an absolute URL from `vite.config.ts`.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiClientError extends Error {}

async function authenticatedFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  const token = await auth.token();
  if (!token) throw new ApiClientError("Not authenticated");

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(input, { ...init, headers });
  } catch {
    // A transport failure (offline, DNS, server down) surfaces as `TypeError: Failed to fetch`,
    // which means nothing to the person holding the phone.
    throw new ApiClientError("Can't reach the server. Check your connection and try again.");
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
      const match = e.message.match(/^API error \d+: (.*)$/s);
      if (match) {
        const parsed = safeJsonParse(match[1]);
        if (parsed && typeof parsed === "object" && "error" in parsed) {
          throw new ApiClientError(String((parsed as { error: unknown }).error));
        }
        // Non-JSON body (gateway HTML, empty 500) — the raw text is noise to the user.
        throw new ApiClientError("The server had a problem. Try again in a moment.");
      }
    }
    throw e;
  }
}

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

  const res = await authenticatedFetch(`${API_BASE_URL}/mobile${path}${suffix}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String(json.error)
        : "The server had a problem. Try again in a moment.";
    throw new ApiClientError(message);
  }
  return json as T;
}
