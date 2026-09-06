import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invalidate, store } from "$lib/core/store.svelte";
import { isDesktop } from "$lib/desktop/platform";
import { startGoogleConnect } from "$lib/integrations/queries";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

/** Thrown out of `connectGoogle` when the caller aborts the wait — not a failure worth showing. */
export class ConnectCancelled extends Error {}

/**
 * Google refuses OAuth inside an embedded webview, so the consent flow always runs in a real
 * browser: Safari on iOS, the system browser on macOS (Tauri's webview is embedded too — the
 * same rule that sends sign-in to a real browser applies here). Nothing comes back through it —
 * no custom scheme, no universal link — so the app watches for the connection three ways
 * instead: the sheet closing, the app resuming, and a short poll for whichever the platform
 * doesn't fire.
 */
export async function connectGoogle(signal?: AbortSignal): Promise<void> {
  const native = Capacitor.isNativePlatform();
  // The callback runs on the backend's origin, which in dev isn't the one serving the app.
  const url = await startGoogleConnect(native || isDesktop ? "app" : "web", window.location.origin);

  if (!native && !isDesktop) {
    window.location.href = url;
    return;
  }

  if (isDesktop) await openUrl(url);
  else await Browser.open({ url, presentationStyle: "popover" });

  await waitForConnection(signal);
}

async function waitForConnection(signal?: AbortSignal): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const listeners = native
    ? [
        await Browser.addListener("browserFinished", () => void store.integrations.refresh()),
        await App.addListener("resume", () => void store.integrations.refresh()),
      ]
    : [];

  try {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new ConnectCancelled();
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (signal?.aborted) throw new ConnectCancelled();
      await store.integrations.refresh();
      if (store.integrations.value?.some((i) => i.provider === "google" && i.connected)) {
        if (native) await Browser.close().catch(() => undefined);
        invalidate.integrations();
        return;
      }
    }
  } finally {
    await Promise.all(listeners.map((l) => l.remove()));
  }
}
