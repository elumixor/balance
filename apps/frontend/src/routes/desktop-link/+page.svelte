<script lang="ts">
  import { page } from "$app/state";
  import { auth, authErrorMessage } from "$lib/auth.svelte";
  import AuthShell from "$lib/components/AuthShell.svelte";
  import Button from "$lib/components/Button.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { createDesktopTicket } from "$lib/queries";

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

  let error = $state<string | null>(null);
  let handedOff = $state(false);

  $effect(() => {
    if (!auth.loaded || error) return;
    if (auth.signedIn) void handOff();
    else void auth.startSSO(strategy, "/desktop-link").catch((e) => (error = authErrorMessage(e, "Sign in didn't finish.")));
  });

  async function handOff() {
    if (handedOff) return;
    handedOff = true;
    try {
      const ticket = await createDesktopTicket();
      window.location.href = `balance-desktop://auth?ticket=${encodeURIComponent(ticket)}`;
    } catch (e) {
      handedOff = false;
      error = e instanceof Error ? e.message : "Couldn't hand the session over.";
    }
  }
</script>

<AuthShell tagline={handedOff ? "Sending you back to Balance." : "Signing you in for the desktop app."}>
  {#if error}
    <p class="t-label text-danger">{error}</p>
    <Button label="Try again" onclick={() => ((error = null), (handedOff = false))} full />
  {:else if handedOff}
    <p class="t-label text-fg-muted">
      Your browser will ask to open Balance. If nothing happens, open the app and try again.
    </p>
  {:else}
    <div class="flex justify-center"><Spinner /></div>
  {/if}
</AuthShell>
