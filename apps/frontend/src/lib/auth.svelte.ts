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
 * Everything Clerk keeps about this device lives under its own prefix, split between local
 * storage and a cookie. Which of those keys exist is Clerk's business and changes between
 * versions, so the whole prefix is mirrored rather than any one name.
 */
const CLERK_STORAGE_PREFIX = "__clerk";
const MIRRORED_CLERK_STATE = "balance:clerk-state";
/** Clerk's own cookie lifetime for the dev-browser token. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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
    this.#ready ??= this.#load();
    return this.#ready;
  }

  async #load() {
    const clerk = new Clerk(PUBLISHABLE_KEY);
    // A webview is not a browser that keeps things. `capacitor.config.ts` serves the app from
    // `https://localhost` so Clerk recognises the origin, but WKWebView still prunes what Clerk
    // leaves behind, which is why the app asked for a sign-in every launch. On a development
    // instance, what actually re-authenticates the browser is `__clerk_db_jwt` — set as a
    // *cookie*, not local storage — so both are mirrored into native storage, where nothing
    // prunes them, and put back before Clerk goes looking.
    //
    // Telling Clerk it isn't a standard browser is not the fix, however tempting it reads: a
    // development instance then can't run its browser handshake at all, and every launch fails
    // with "Unable to authenticate this browser for your development instance".
    try {
      if (isNativeApp) await restoreClerkState();
      await clerk.load();
    } catch (e) {
      // A signed-out app is still usable enough to show what went wrong; hanging on the
      // splash tells the person holding the phone nothing at all.
      this.startupError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.loaded = true;
      throw e;
    }
    this.#clerk = clerk;
    clerk.addListener(() => {
      this.#sync();
      if (isNativeApp) void rememberClerkState();
    });
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
  }

  /** The session token every API request carries, or null when nobody is signed in. */
  async token() {
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
    const response = await fetch(`${API_BASE_URL}/mobile/auth/native/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const body = (await response.json()) as { ticket?: string; error?: string };
    if (!response.ok || !body.ticket) throw new Error(body.error ?? "Sign in didn't finish.");
    return body.ticket;
  }

  /**
   * Turns a short-lived Clerk sign-in ticket into this client's session. Both platforms that
   * can't run Clerk's redirect flow in their own webview end up here: iOS with a ticket minted
   * from a native idToken, macOS with one handed back by the browser that did the OAuth.
   */
  async redeemTicket(ticket: string) {
    const signIn = await this.signIn();
    const result = await signIn.create({ strategy: "ticket", ticket });
    if (result.status !== "complete") throw new Error("Sign in didn't finish.");
    await this.activate(result.createdSessionId);
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
    // Signing out has to clear the mirror too, or the next launch restores the device Clerk was
    // just told to forget.
    if (isNativeApp) await forgetClerkState();
    this.#sync();
  }
}

export const auth = new Auth();

/**
 * Clerk's device state, put back before Clerk looks for it. Native storage outlives the webview's
 * own, so this is what turns "signed in yesterday" into a session today rather than a sign-in
 * screen. A device with nothing mirrored yet — a fresh install — restores nothing and signs in
 * the ordinary way.
 */
async function restoreClerkState() {
  try {
    const { value } = await Preferences.get({ key: MIRRORED_CLERK_STATE });
    if (!value) return;
    const state = JSON.parse(value) as { localStorage?: Record<string, string>; cookies?: Record<string, string> };
    for (const [key, item] of Object.entries(state.localStorage ?? {})) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, item);
    }
    const existing = readClerkCookies();
    for (const [key, item] of Object.entries(state.cookies ?? {})) {
      if (!(key in existing)) writeClerkCookie(key, item);
    }
  } catch {
    // A mirror that can't be read is a sign-in screen, not an error worth showing.
  }
}

async function rememberClerkState() {
  try {
    const localStorageState: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CLERK_STORAGE_PREFIX)) continue;
      localStorageState[key] = localStorage.getItem(key) ?? "";
    }
    const state = { localStorage: localStorageState, cookies: readClerkCookies() };
    await Preferences.set({ key: MIRRORED_CLERK_STATE, value: JSON.stringify(state) });
  } catch {
    // Same: the cost of failing here is one more sign-in, later.
  }
}

function readClerkCookies() {
  const cookies: Record<string, string> = {};
  for (const pair of document.cookie.split("; ")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    if (key.startsWith(CLERK_STORAGE_PREFIX)) cookies[key] = decodeURIComponent(pair.slice(eq + 1));
  }
  return cookies;
}

function writeClerkCookie(key: string, value: string) {
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

async function forgetClerkState() {
  try {
    await Preferences.remove({ key: MIRRORED_CLERK_STATE });
  } catch {
    /* nothing to forget */
  }
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
