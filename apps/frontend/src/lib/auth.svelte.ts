import { SocialLogin } from "@capgo/capacitor-social-login";
import { Clerk } from "@clerk/clerk-js";
import { API_BASE_URL } from "./api";

// Clerk publishable keys are public identifiers (not secrets) — safe to ship in the client bundle.
const PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA";

class Auth {
  /** False until Clerk has replayed any stored session, so screens can hold their first frame. */
  loaded = $state(false);
  signedIn = $state(false);
  email = $state("");
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
    // The webview is a standard browser as far as Clerk is concerned — `capacitor.config.ts`
    // serves the app from `https://localhost` precisely so that stays true on device.
    try {
      await clerk.load();
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
   * Google forbids OAuth consent inside an embedded WKWebView, so on iOS `startSSO`'s
   * redirect flow gets bounced out to system Safari — which can't resolve the app's
   * `https://localhost` origin and never returns. Native Google Sign-In sidesteps the
   * whole redirect dance: get an idToken from the OS-native picker, trade it for a
   * short-lived Clerk sign-in ticket via the backend, and redeem the ticket right here.
   */
  async signInWithNativeGoogle() {
    await SocialLogin.initialize({
      google: { iOSClientId: "836194369955-5vudcjgcu637ma5bje6idu96emjm0f1a.apps.googleusercontent.com" },
    });
    const { result } = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"] } });
    const idToken = "idToken" in result ? result.idToken : undefined;
    if (!idToken) throw new Error("Google didn't return an ID token.");

    const response = await fetch(`${API_BASE_URL}/mobile/auth/native/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const body = (await response.json()) as { ticket?: string; error?: string };
    if (!response.ok || !body.ticket) throw new Error(body.error ?? "Sign in didn't finish.");

    const signIn = await this.signIn();
    const ticketResult = await signIn.create({ strategy: "ticket", ticket: body.ticket });
    if (ticketResult.status !== "complete") throw new Error("Sign in didn't finish.");
    await this.activate(ticketResult.createdSessionId);
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
