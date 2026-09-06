/** Written the moment there's a session, read before Clerk has had a chance to confirm one. */
const SIGNED_IN_KEY = "balance:signed-in";

export function readSignedIn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSignedIn(signedIn: boolean) {
  try {
    if (typeof localStorage === "undefined") return;
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Storage being unavailable only costs the splash-free launch, not the session itself.
  }
}
