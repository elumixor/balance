import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Clerk } from "@clerk/clerk-js";
import { postPublic } from "$lib/core/api";
import { APPLE_CLIENT_ID, CLERK_PUBLISHABLE_KEY, DEV_AUTH, DEV_AUTH_EMAIL, GOOGLE_IOS_CLIENT_ID } from "$lib/core/env";
import { isDesktop } from "$lib/desktop/platform";
import { ensureDeviceGrant, redeemClerkTicket, restoreNativeSession, revokeDeviceGrant } from "./device-grant";
import { getProfile } from "./queries";
import { readSignedIn, writeSignedIn } from "./signed-in";

const isNativeApp = Capacitor.isNativePlatform();

/**
 * Which shells sign themselves back in rather than asking.
 *
 * Both of them, for the same reason: what clerk-js leaves behind is pruned in the iOS webview and
 * does not survive a relaunch of the Mac shell either, so both used to open on a sign-in screen —
 * and on the Mac a login-item launch then had no session for the menu bar to draw from. The grant
 * lives where nothing prunes it (see `device-grant.ts`).
 */
const keepsDeviceGrant = isNativeApp || isDesktop;

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
  /** The name the account signed up with — Google's or Apple's — or empty when it gave none. */
  name = $state("");
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
      this.email = DEV_AUTH_EMAIL;
      // A stable id, because the store throws away what it holds when the account changes — and
      // an empty one would read as "nobody" on every launch.
      this.userId = "dev-auth";
      void this.#profile();
      // Nothing here ever touches Clerk, so nothing can await a client that will never exist.
      this.#ready ??= Promise.resolve(null as unknown as Clerk);
      return this.#ready;
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
    const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
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
      if (keepsDeviceGrant && !clerk.session) {
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
    this.name = clerk?.user?.fullName ?? "";
    this.avatarUrl = clerk?.user?.hasImage ? (clerk.user.imageUrl ?? "") : "";
    this.userId = clerk?.user?.id ?? "";
    writeSignedIn(this.signedIn);
    if (keepsDeviceGrant && clerk?.session) void ensureDeviceGrant(clerk);
    if (clerk?.session) void this.#profile();
  }

  /**
   * The name and the face, from the server rather than the session: the session's own copy is
   * empty on a device that skipped signing in, and a face that shows on one device and not on
   * another reads as a bug. A profile that doesn't arrive costs an initial, not a screen.
   */
  #profileFor = "";

  async #profile() {
    const userId = this.userId;
    if (this.#profileFor === userId) return;
    this.#profileFor = userId;
    try {
      const profile = await getProfile();
      if (this.userId !== userId) return;
      this.name ||= profile.name;
      this.email ||= profile.email;
      this.avatarUrl ||= profile.imageUrl;
    } catch (e) {
      this.#profileFor = "";
      console.warn("[auth] profile didn't load", e);
    }
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
      google: {
        iOSClientId: GOOGLE_IOS_CLIENT_ID,
      },
    });
    const { result } = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["email", "profile"] },
    });
    const idToken = "idToken" in result ? result.idToken : undefined;
    if (!idToken) throw new Error("Google didn't return an ID token.");
    await this.redeemTicket(await this.#nativeTicket("google", idToken));
  }

  async signInWithNativeApple() {
    await SocialLogin.initialize({
      apple: { clientId: APPLE_CLIENT_ID },
    });
    const { result } = await SocialLogin.login({
      provider: "apple",
      options: { scopes: ["email", "name"] },
    });
    const idToken = "idToken" in result ? result.idToken : undefined;
    if (!idToken) throw new Error("Apple didn't return an ID token.");
    await this.redeemTicket(await this.#nativeTicket("apple", idToken));
  }

  async #nativeTicket(provider: "google" | "apple", idToken: string) {
    const { ticket } = await postPublic<{ ticket: string }>(`/auth/native/${provider}`, { idToken });
    return ticket;
  }

  /**
   * Turns a short-lived Clerk sign-in ticket into this client's session. Both platforms that
   * can't run Clerk's redirect flow in their own webview end up here: iOS with a ticket minted
   * from a native idToken, macOS with one handed back by the browser that did the OAuth.
   */
  async redeemTicket(ticket: string) {
    const clerk = await this.load();
    await redeemClerkTicket(clerk, ticket);
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
    if (keepsDeviceGrant) await revokeDeviceGrant();
    this.#sync();
  }
}

export const auth = new Auth();

/** Clerk error bodies are structured; the long message is the one worth showing. */
export function authErrorMessage(error: unknown, fallback: string) {
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  const first = errors?.[0];
  if (first) return first.longMessage ?? first.message ?? fallback;
  return error instanceof Error ? error.message : fallback;
}
