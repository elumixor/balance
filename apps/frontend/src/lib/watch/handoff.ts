import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { auth } from "$lib/account/auth.svelte";
import { API_BASE_URL } from "$lib/core/api";

/**
 * Giving the watch app a session of its own.
 *
 * The watch talks to the API by itself, so it needs its own Clerk session, and there is no
 * sign-in worth putting anyone through on a watch. Instead the phone — signed in already — mints
 * a sign-in ticket and pushes it across Watch Connectivity, where the watch redeems it once and
 * keeps a session that refreshes on its own from then on.
 *
 * A ticket is pushed whenever the phone app comes to the front rather than only at sign-in: the
 * watch may have been paired, reinstalled, or left unopened long enough for its session to lapse,
 * and none of those are things this side can see. A ticket the watch doesn't need costs nothing —
 * it is redeemed only when the watch has no session.
 */

interface WatchHandoffPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  setTicket(options: { ticket: string }): Promise<void>;
  addListener(event: "ticketRequested", handler: () => void): Promise<{ remove: () => Promise<void> }>;
}

const plugin = registerPlugin<WatchHandoffPlugin>("WatchHandoff");

const isIOS = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();

async function mintTicket() {
  const token = await auth.token();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/mobile/auth/watch/ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { ticket?: string; error?: string };
  return response.ok ? (body.ticket ?? null) : null;
}

/**
 * Best effort on the phone's screen — a watch that didn't get a ticket shows its "open Balance"
 * card, and there is nothing the person holding the phone could do about it anyway. It is logged
 * rather than swallowed, because every failure here looks identical from the wrist: a watch that
 * simply never signs in, whether the plugin is missing, the mint failed, or there is no watch.
 */
async function push() {
  try {
    const { available } = await plugin.isAvailable();
    if (!available) return;
    const ticket = await mintTicket();
    if (!ticket) return console.warn("[watch] signed in, but the API wouldn't mint a ticket");
    await plugin.setTicket({ ticket });
  } catch (e) {
    console.warn("[watch] couldn't hand a session over", e);
  }
}

/** Starts pushing tickets to the watch, and stops when the session that authorises them ends. */
export function startWatchHandoff() {
  if (!isIOS) return () => {};

  void push();

  const requested = plugin.addListener("ticketRequested", () => void push());
  const resumed = App.addListener("resume", () => void push());

  return () => {
    void requested.then((handle) => handle.remove());
    void resumed.then((handle) => handle.remove());
  };
}
