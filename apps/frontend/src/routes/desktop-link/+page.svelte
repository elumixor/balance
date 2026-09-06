<script lang="ts">
  import { page } from "$app/state";
  import { auth, authErrorMessage } from "$lib/account/auth.svelte";
  import { AuthShell, Button, Spinner } from "$lib/components";
  import { createDesktopTicket } from "$lib/account/queries";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";

  /**
   * The browser half of signing in to the macOS app.
   *
   * The app can't run Clerk's redirect flow itself — `tauri://localhost` is not a redirect URL
   * Clerk will accept — so it sends people here instead. This page signs them in the ordinary
   * web way, trades that session for a one-minute ticket, and hands it back over `balance-desktop://`.
   * The session it created here is incidental; the app's own is what the ticket becomes.
   */
  const strategy = $derived(
    page.url.searchParams.get("strategy") === "oauth_apple" ? "oauth_apple" : "oauth_google",
  );

  let handedOff = $state(false);
  /** One failure stops the effect asking again; the card in the corner carries the way back. */
  let failed = $state(false);

  $effect(() => {
    if (!auth.loaded || failed) return;
    if (auth.signedIn) void handOff();
    else
      void auth.startSSO(strategy, "/desktop-link").catch((e) => {
        failed = true;
        diagnostics.report("Sign-in", e, { title: authErrorMessage(e, "Sign in didn’t finish.") });
      });
  });

  async function handOff() {
    if (handedOff) return;
    handedOff = true;
    try {
      const ticket = await createDesktopTicket();
      window.location.href = `balance-desktop://auth?ticket=${encodeURIComponent(ticket)}`;
    } catch (e) {
      handedOff = false;
      failed = true;
      diagnostics.report("Desktop", e, { title: "Couldn’t hand the session over", retry: () => ((failed = false), void handOff()) });
    }
  }
</script>

<AuthShell tagline={handedOff ? "Sending you back to Balance." : "Signing you in for the desktop app."}>
  {#if handedOff}
    <p class="t-label text-fg-muted">
      Your browser will ask to open Balance. If nothing happens, open the app and try again.
    </p>
  {:else}
    <div class="flex justify-center"><Spinner /></div>
  {/if}
</AuthShell>
