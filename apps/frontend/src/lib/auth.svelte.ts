import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Clerk } from "@clerk/clerk-js";
import { API_BASE_URL } from "./api";

// Clerk publishable keys are public identifiers (not secrets) — safe to ship in the client bundle.
const PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA";

/** Written the moment there's a session, read before Clerk has had a chance to confirm one. */
const SIGNED_IN_KEY = "balance:signed-in";

const isNativeApp = Capacitor.isNativePlatform();

/**
 * Skip the sign-in entirely, for a simulator pointed at a local backend.
 *
 * Only ever set on a build made by hand for that purpose; the deployed build never carries it, and
 * a build that did would still be useless, because the backend refuses the bypass on Vercel and in
 * production. The server is the fence — this half only saves the clicks.
 */
const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === "1";

/** The device's standing permission to sign itself back in — see `restoreNativeSession`. */
const DEVICE_GRANT_KEY = "balance:device-grant";

/**
 * How long the whole start-up — Clerk's own load, and the device's silent sign-in behind it — is
 * allowed to take before it counts as failed.
 *
 * Nothing in here answers on its own. `clerk.load()` waits on a script and a handshake with the
 * development instance, and the grant exchange is a plain request; a webview suspended mid-flight
 * resumes with a promise that will never settle. `loaded` would then stay false forever, which is
 * not a splash — the shell opens anyway on the device's last-known session, so what the person
 * actually gets is every screen skeletoning behind a tab bar that does nothing, with no error and
 * nothing to retry. A start-up that fails says so; one that hangs says nothing at all.
 */
const STARTUP_TIMEOUT_MS = 15_000;

/** The same limit for the sign-in requests, which go out by hand rather than through the client. */
const REQUEST_TIMEOUT_MS = 20_000;

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

async function withDeadline<T>(promise: Promise<T>, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), STARTUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class Auth {
  /** False until Clerk has replayed any stored session, so screens can hold their first frame. */
  loaded = $state(false);
  /**
   * Whether this device ended its last visit signed in. Clerk takes a round trip to say so
   * for certain, and holding the splash for it means a launch that stares back — so the app
   * opens on the shell and its stored rows, and the confirmation lands behind them. A session
   * that turns out to have expired redirects to sign-in the moment Clerk says so.
   */
  readonly wasSignedIn = readSignedIn();
  signedIn = $state(false);
  email = $state("");
  /**
   * The picture the account signed up with — Google's, for anyone who came in through it. Empty
   * when there isn't one: Clerk answers `imageUrl` regardless, with initials it drew itself, and
   * the app would rather draw its own than show a second style of the same fallback.
   */
  avatarUrl = $state("");
  /** Which account's data the device is holding — see `adoptUser`. */
  userId = $state("");
  /** Set when Clerk itself couldn't start. Without this the app sits on its splash forever. */
  startupError = $state<string | null>(null);

  #clerk: Clerk | null = null;
  #ready: Promise<Clerk> | null = null;

  /** Idempotent: every screen can await this, only the first call actually loads Clerk. */
  load() {
    if (DEV_AUTH) {
      this.signedIn = true;
      this.loaded = true;
      this.email = "dev@localhost";
      // Nothing here ever touches Clerk, so nothing can await a client that will never exist.
      return (this.#ready ??= Promise.resolve(null as unknown as Clerk));
    }
    this.#ready ??= this.#load();
    return this.#ready;
  }

  /**
   * Starts over after a start-up that failed. The client that didn't load is thrown away with the
   * promise that reported it, so the next `load()` is a first load again rather than the old
   * rejection handed back to everybody who asks.
   */
  retry() {
    this.startupError = null;
    this.loaded = false;
    this.#clerk = null;
    this.#ready = null;
    return this.load();
  }

  async #load() {
    const clerk = new Clerk(PUBLISHABLE_KEY);
    try {
      await withDeadline(clerk.load(), "Sign-in took too long to load.");
      // A webview is not a browser that keeps things: WKWebView prunes both halves of what
      // clerk-js leaves behind — local storage and the dev-browser cookie — so a launch opens
      // signed out however carefully that state is mirrored into native storage. The device
      // signs itself back in instead, with a grant that lives where nothing prunes it.
      //
      // Telling Clerk it isn't a standard browser is not the fix, however tempting it reads: a
      // development instance then can't run its browser handshake at all, and every launch fails
      // with "Unable to authenticate this browser for your development instance".
      if (isNativeApp && !clerk.session) {
        await withDeadline(restoreNativeSession(clerk), "Signing this device back in took too long.");
      }
    } catch (e) {
      // A signed-out app is still usable enough to show what went wrong; hanging on the
      // splash tells the person holding the phone nothing at all.
      this.startupError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.loaded = true;
      throw e;
    }
    this.#clerk = clerk;
    clerk.addListener(() => this.#sync());
    this.#sync();
    this.loaded = true;
    return clerk;
  }

  #sync() {
    const clerk = this.#clerk;
    this.signedIn = Boolean(clerk?.session);
    this.email = clerk?.user?.primaryEmailAddress?.emailAddress ?? "";
    this.avatarUrl = clerk?.user?.hasImage ? (clerk.user.imageUrl ?? "") : "";
    this.userId = clerk?.user?.id ?? "";
    writeSignedIn(this.signedIn);
    if (isNativeApp && clerk?.session) void ensureDeviceGrant(clerk);
  }

  /** The session token every API request carries, or null when nobody is signed in. */
  async token() {
    // Any non-empty string: the backend isn't reading it when the bypass is on, only checking
    // that a request looks like one an app would make.
    if (DEV_AUTH) return "dev";
    const clerk = await this.load();
    return (await clerk.session?.getToken()) ?? null;
  }

  async signIn() {
    const clerk = await this.load();
    if (!clerk.client) throw new Error("Clerk isn't ready yet.");
    return clerk.client.signIn;
  }

  async signUp() {
    const clerk = await this.load();
    if (!clerk.client) throw new Error("Clerk isn't ready yet.");
    return clerk.client.signUp;
  }

  async activate(sessionId: string | null | undefined) {
    if (!sessionId) throw new Error("Sign in didn't finish.");
    const clerk = await this.load();
    await clerk.setActive({ session: sessionId });
    this.#sync();
  }

  /** Hands off to the provider; Clerk brings the browser back to `returnTo` when it's done. */
  async startSSO(strategy: "oauth_google" | "oauth_apple", returnTo: string) {
    const signIn = await this.signIn();
    await signIn.authenticateWithRedirect({
      strategy,
      redirectUrl: `${window.location.origin}/sso-callback`,
      redirectUrlComplete: returnTo,
    });
  }

  /**
   * Google and Apple both forbid (or can't reliably return from) OAuth consent inside an
   * embedded WKWebView — Google forces a hand-off to system Safari, which can't resolve the
   * app's `https://localhost` origin and never returns; Apple's web flow shares the same
   * fate. Native sign-in sidesteps the whole redirect dance: get an idToken from the OS's
   * own picker, trade it for a short-lived Clerk sign-in ticket via the backend, and redeem
   * the ticket right here — no browser involved at all.
   */
  async signInWithNativeGoogle() {
    await SocialLogin.initialize({
      google: { iOSClientId: "836194369955-5vudcjgcu637ma5bje6idu96emjm0f1a.apps.googleusercontent.com" },
    });
    const { result } = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"] } });
    const idToken = "idToken" in result ? result.idToken : undefined;
    if (!idToken) throw new Error("Google didn't return an ID token.");
    await this.redeemTicket(await this.#nativeTicket("google", idToken));
  }

  async signInWithNativeApple() {
    await SocialLogin.initialize({ apple: { clientId: "com.elumixor.balance" } });
    const { result } = await SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"] } });
    const idToken = "idToken" in result ? result.idToken : undefined;
    if (!idToken) throw new Error("Apple didn't return an ID token.");
    await this.redeemTicket(await this.#nativeTicket("apple", idToken));
  }

  async #nativeTicket(provider: "google" | "apple", idToken: string) {
    const { ticket } = await postJson<{ ticket: string }>(`/mobile/auth/native/${provider}`, { idToken });
    return ticket;
  }

  /**
   * Turns a short-lived Clerk sign-in ticket into this client's session. Both platforms that
   * can't run Clerk's redirect flow in their own webview end up here: iOS with a ticket minted
   * from a native idToken, macOS with one handed back by the browser that did the OAuth.
   */
  async redeemTicket(ticket: string) {
    const clerk = await this.load();
    await redeemTicket(clerk, ticket);
    this.#sync();
  }

  async handleRedirectCallback(afterSignIn: string) {
    const clerk = await this.load();
    await clerk.handleRedirectCallback({
      signInForceRedirectUrl: afterSignIn,
      signUpForceRedirectUrl: afterSignIn,
    });
  }

  async signOut() {
    const clerk = await this.load();
    await clerk.signOut();
    // The grant has to go with the session, or the next launch signs the device straight back in.
    if (isNativeApp) await revokeDeviceGrant();
    this.#sync();
  }
}

export const auth = new Auth();

/**
 * Signs the device back in without anybody touching the screen.
 *
 * The grant is an opaque secret held in native storage, which outlives the webview's own; the
 * backend trades it for a Clerk sign-in ticket and hands back a replacement, so the copy just
 * spent is worthless from here on. A device with no grant yet — a fresh install, or a sign-out —
 * restores nothing and signs in the ordinary way.
 */
async function restoreNativeSession(clerk: Clerk) {
  const token = await readDeviceGrant();
  if (!token) return;
  try {
    const { ticket, token: rotated } = await postJson<{ ticket: string; token: string }>("/mobile/auth/device/ticket", {
      token,
    });
    await Preferences.set({ key: DEVICE_GRANT_KEY, value: rotated });
    await redeemTicket(clerk, ticket);
  } catch (e) {
    // A grant the server refuses (revoked, expired, or spent by a restore interrupted after it
    // rotated) is worth forgetting; a launch with no network is not — throwing that grant away
    // would turn every offline start into a sign-in screen the next time there is a signal.
    if (e instanceof RequestError && e.rejected) await Preferences.remove({ key: DEVICE_GRANT_KEY });
  }
}

/**
 * A device that is signed in but holds no grant would never get one — including after a restore.
 * Every resource change asks, so the in-flight one is remembered: two answers would be two rows.
 */
let pendingGrant: Promise<void> | null = null;

function ensureDeviceGrant(clerk: Clerk) {
  pendingGrant ??= issueDeviceGrant(clerk).finally(() => (pendingGrant = null));
  return pendingGrant;
}

async function issueDeviceGrant(clerk: Clerk) {
  try {
    if (await readDeviceGrant()) return;
    const sessionToken = await clerk.session?.getToken();
    if (!sessionToken) return;
    const { token } = await postJson<{ token: string }>("/mobile/auth/device", {}, sessionToken);
    await Preferences.set({ key: DEVICE_GRANT_KEY, value: token });
  } catch {
    // Worst case the next launch asks for a sign-in, which is what it did before this existed.
  }
}

async function revokeDeviceGrant() {
  const token = await readDeviceGrant();
  await Preferences.remove({ key: DEVICE_GRANT_KEY });
  if (!token) return;
  try {
    await postJson("/mobile/auth/device/revoke", { token });
  } catch {
    // The device has already forgotten it; the row expires on its own.
  }
}

async function readDeviceGrant() {
  const { value } = await Preferences.get({ key: DEVICE_GRANT_KEY });
  return value ?? null;
}

async function redeemTicket(clerk: Clerk, ticket: string) {
  const signIn = clerk.client?.signIn;
  if (!signIn) throw new Error("Clerk isn't ready yet.");
  const result = await signIn.create({ strategy: "ticket", ticket });
  if (result.status !== "complete" || !result.createdSessionId) throw new Error("Sign in didn't finish.");
  await clerk.setActive({ session: result.createdSessionId });
}

/** A request the server answered, so its verdict is the server's — not the network's. */
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** The server understood and said no, rather than being unreachable or broken. */
  get rejected() {
    return this.status >= 400 && this.status < 500;
  }
}

/**
 * The generated API client signs every request with a Clerk session token, which is exactly what
 * the sign-in calls don't have (or, for a device grant, don't need), so they go out by hand.
 */
async function postJson<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  // A request with no limit on it is the one that leaves a launch hanging — see `withDeadline`.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new RequestError(payload.error ?? `Request to ${path} failed.`, response.status);
  return payload;
}

function readSignedIn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSignedIn(signedIn: boolean) {
  try {
    if (typeof localStorage === "undefined") return;
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Storage being unavailable only costs the splash-free launch, not the session itself.
  }
}

/** Clerk error bodies are structured; the long message is the one worth showing. */
export function authErrorMessage(error: unknown, fallback: string) {
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  const first = errors?.[0];
  if (first) return first.longMessage ?? first.message ?? fallback;
  return error instanceof Error ? error.message : fallback;
}
