import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { startGoogleConnect } from "$lib/queries";
import { invalidate, store } from "$lib/store.svelte";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

/**
 * Google refuses OAuth inside an embedded webview, so on iOS the consent flow runs in a real
 * Safari sheet. Nothing comes back through it — no custom scheme, no universal link — so the
 * app watches for the connection three ways instead: the sheet closing, the app resuming, and
 * a short poll for whichever of those the platform doesn't fire.
 */
export async function connectGoogle(): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const url = await startGoogleConnect(native ? "app" : "web");

  if (!native) {
    window.location.href = url;
    return;
  }

  await Browser.open({ url, presentationStyle: "popover" });
  await waitForConnection();
}

async function waitForConnection(): Promise<void> {
  const listeners = [
    await Browser.addListener("browserFinished", () => void store.integrations.refresh()),
    await App.addListener("resume", () => void store.integrations.refresh()),
  ];

  try {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      await store.integrations.refresh();
      if (store.integrations.value?.some((i) => i.provider === "google" && i.connected)) {
        await Browser.close().catch(() => undefined);
        invalidate.integrations();
        return;
      }
    }
  } finally {
    await Promise.all(listeners.map((l) => l.remove()));
  }
}
