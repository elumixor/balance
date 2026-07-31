import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/current-user";

/** Shared error shape for every /api/mobile/* route. */
export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Resolve the signed-in DB user for a mobile API route, or return a 401 JSON
 * response. Clerk's clerkMiddleware()/auth() already accepts an
 * "Authorization: Bearer <session-token>" header from native clients the same
 * way it accepts the web session cookie, so getOrCreateDbUser() works as-is.
 */
export async function requireDbUser() {
  try {
    const user = await getOrCreateDbUser();
    return { user, error: null as null };
  } catch {
    return { user: null, error: jsonError("Not authenticated", 401) };
  }
}
