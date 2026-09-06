import { Preferences } from "@capacitor/preferences";
import type { Clerk } from "@clerk/clerk-js";
import { ApiClientError, postPublic } from "$lib/core/api";

/** The device's standing permission to sign itself back in — see `restoreNativeSession`. */
const DEVICE_GRANT_KEY = "balance:device-grant";

/**
 * Signs the device back in without anybody touching the screen.
 *
 * The grant is an opaque secret held in native storage, which outlives the webview's own; the
 * backend trades it for a Clerk sign-in ticket and hands back a replacement, so the copy just
 * spent is worthless from here on. A device with no grant yet — a fresh install, or a sign-out —
 * restores nothing and signs in the ordinary way.
 */
export async function restoreNativeSession(clerk: Clerk) {
  const token = await readDeviceGrant();
  if (!token) return;
  try {
    const { ticket, token: rotated } = await postPublic<{
      ticket: string;
      token: string;
    }>("/auth/device/ticket", {
      token,
    });
    await Preferences.set({ key: DEVICE_GRANT_KEY, value: rotated });
    await redeemClerkTicket(clerk, ticket);
  } catch (e) {
    // A grant the server refuses (revoked, expired, or spent by a restore interrupted after it
    // rotated) is worth forgetting; a launch with no network is not — throwing that grant away
    // would turn every offline start into a sign-in screen the next time there is a signal.
    if (e instanceof ApiClientError && e.rejected) await Preferences.remove({ key: DEVICE_GRANT_KEY });
  }
}

/**
 * A device that is signed in but holds no grant would never get one — including after a restore.
 * Every resource change asks, so the in-flight one is remembered: two answers would be two rows.
 */
let pendingGrant: Promise<void> | null = null;

export function ensureDeviceGrant(clerk: Clerk) {
  pendingGrant ??= issueDeviceGrant(clerk).finally(() => (pendingGrant = null));
  return pendingGrant;
}

async function issueDeviceGrant(clerk: Clerk) {
  try {
    if (await readDeviceGrant()) return;
    const sessionToken = await clerk.session?.getToken();
    if (!sessionToken) return;
    const { token } = await postPublic<{ token: string }>("/auth/device", {}, sessionToken);
    await Preferences.set({ key: DEVICE_GRANT_KEY, value: token });
  } catch {
    // Worst case the next launch asks for a sign-in, which is what it did before this existed.
  }
}

export async function revokeDeviceGrant() {
  const token = await readDeviceGrant();
  await Preferences.remove({ key: DEVICE_GRANT_KEY });
  if (!token) return;
  try {
    await postPublic("/auth/device/revoke", { token });
  } catch {
    // The device has already forgotten it; the row expires on its own.
  }
}

async function readDeviceGrant() {
  const { value } = await Preferences.get({ key: DEVICE_GRANT_KEY });
  return value ?? null;
}

export async function redeemClerkTicket(clerk: Clerk, ticket: string) {
  const signIn = clerk.client?.signIn;
  if (!signIn) throw new Error("Clerk isn't ready yet.");
  const result = await signIn.create({ strategy: "ticket", ticket });
  if (result.status !== "complete" || !result.createdSessionId) throw new Error("Sign in didn't finish.");
  await clerk.setActive({ session: result.createdSessionId });
}
