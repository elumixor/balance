const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

export class ApiClientError extends Error {}

export type GetToken = () => Promise<string | null>;

let getTokenRef: GetToken = async () => null;

/** Wire the Clerk `getToken` function once, near the auth provider, so `api()` can attach it to every request. */
export function configureApiAuth(getToken: GetToken) {
  getTokenRef = getToken;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getTokenRef();
  if (!token) throw new ApiClientError("Not authenticated");

  const res = await fetch(`${API_BASE_URL}/mobile${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json && typeof json === "object" && "error" in json ? String(json.error) : "Request failed";
    throw new ApiClientError(message);
  }
  return json as T;
}
