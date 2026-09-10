import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isDesktop } from "$lib/desktop/platform";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

/** Thrown when the caller abandons the wait — not a failure worth showing anybody. */
export class ConnectCancelled extends Error {}

export interface OAuthConnect {
  /** Asks the server for the consent URL, told where the browser should be handed back to. */
  start: (mode: "app" | "web", origin: string) => Promise<string>;
  /** Asks the server again whether the grant has landed. Returns true once it has. */
  poll: () => Promise<boolean>;
  /** What to do once it has — invalidating whatever the new grant changes. */
  landed?: () => void;
}

/**
 * A consent flow, wherever the app is running.
 *
 * Google refuses OAuth inside an embedded webview and Notion's screen is no nicer in one, so the
 * flow always runs in a real browser: Safari on iOS, the system browser on macOS (Tauri's webview
 * is embedded too). Nothing comes back through it — no custom scheme, no universal link — so the
 * app watches for the grant three ways instead: the sheet closing, the app resuming, and a short
 * poll for whichever the platform doesn't fire.
 */
export async function oauthConnect({ start, poll, landed }: OAuthConnect, signal?: AbortSignal): Promise<void> {
  const native = Capacitor.isNativePlatform();
  // The callback runs on the backend's origin, which in dev isn't the one serving the app.
  const url = await start(native || isDesktop ? "app" : "web", window.location.origin);

  if (!native && !isDesktop) {
    window.location.href = url;
    return;
  }

  if (isDesktop) await openUrl(url);
  else await Browser.open({ url, presentationStyle: "popover" });

  await waitFor({ poll, landed }, signal);
}

async function waitFor({ poll, landed }: Omit<OAuthConnect, "start">, signal?: AbortSignal): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const listeners = native
    ? [
        await Browser.addListener("browserFinished", () => void poll()),
        await App.addListener("resume", () => void poll()),
      ]
    : [];

  try {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new ConnectCancelled();
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (signal?.aborted) throw new ConnectCancelled();
      if (await poll()) {
        if (native) await Browser.close().catch(() => undefined);
        landed?.();
        return;
      }
    }
  } finally {
    await Promise.all(listeners.map((listener) => listener.remove()));
  }
}
