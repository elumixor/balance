import { Capacitor } from "@capacitor/core";
import { Clerk } from "@clerk/clerk-js";

// Clerk publishable keys are public identifiers (not secrets) — safe to ship in the client bundle.
const PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA";

class Auth {
  /** False until Clerk has replayed any stored session, so screens can hold their first frame. */
  loaded = $state(false);
  signedIn = $state(false);
  email = $state("");

  #clerk: Clerk | null = null;
  #ready: Promise<Clerk> | null = null;

  /** Idempotent: every screen can await this, only the first call actually loads Clerk. */
  load() {
    this.#ready ??= this.#load();
    return this.#ready;
  }

  async #load() {
    const clerk = new Clerk(PUBLISHABLE_KEY);
    // Inside the Capacitor webview the origin is `capacitor://localhost`, where Clerk's
    // cookie-based session handling can't work. Token mode keeps the session in local
    // storage instead — the same path Clerk uses for browser extensions.
    await clerk.load({ standardBrowser: !Capacitor.isNativePlatform() });
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
