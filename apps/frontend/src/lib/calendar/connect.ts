import { ConnectCancelled, oauthConnect } from "$lib/core/oauth-connect";
import { invalidate, store } from "$lib/core/store.svelte";
import { startGoogleConnect } from "$lib/integrations/queries";

export { ConnectCancelled };

/** The calendar's grant, through the shared consent flow — see `core/oauth-connect.ts`. */
export function connectGoogle(signal?: AbortSignal): Promise<void> {
  return oauthConnect(
    {
      start: (mode, origin) => startGoogleConnect(mode, origin),
      poll: async () => {
        await store.integrations.refresh();
        return Boolean(store.integrations.value?.some((one) => one.provider === "google" && one.connected));
      },
      landed: () => invalidate.integrations(),
    },
    signal,
  );
}
