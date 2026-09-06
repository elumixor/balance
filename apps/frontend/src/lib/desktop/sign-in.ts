import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { auth } from "$lib/account/auth.svelte";
import { WEB_APP_ORIGIN } from "$lib/core/env";
import { isDesktop } from "./platform";

/**
 * Signing in to the macOS app through the browser.
 *
 * Clerk's redirect flow can't run here: the app's origin is `tauri://localhost`, and Clerk only
 * accepts an http or https `redirect_url` — never mind that Google refuses OAuth inside an
 * embedded webview in the first place. So the consent screen goes where it works, the real
 * browser, and the session comes back as a ticket over a `balance-desktop://` link.
 *
 * Where the browser goes is the deployed web app rather than this bundle — see `WEB_APP_ORIGIN`.
 */
export function startDesktopSSO(strategy: "oauth_google" | "oauth_apple") {
  return openUrl(`${WEB_APP_ORIGIN}/desktop-link?strategy=${strategy}`);
}

/**
 * Listens for the ticket coming back. Registered for the whole app run rather than by the
 * sign-in screen, because the link arrives at a cold app too — clicking it launches Balance, and
 * by the time the webview is up the screen showing is whichever one the session decides.
 */
export function watchDesktopSignIn() {
  if (!isDesktop) return () => {};

  const pending = onOpenUrl(async (urls) => {
    for (const url of urls) {
      const ticket = new URL(url).searchParams.get("ticket");
      if (ticket) await auth.redeemTicket(ticket);
    }
  });

  return () => void pending.then((off) => off());
}
