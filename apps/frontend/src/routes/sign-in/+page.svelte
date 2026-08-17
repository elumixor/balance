<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { goto } from "$app/navigation";
  import { auth, authErrorMessage } from "$lib/auth.svelte";
  import AuthShell from "$lib/components/AuthShell.svelte";
  import BrowserWait from "$lib/components/BrowserWait.svelte";
  import Button from "$lib/components/Button.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import Field from "$lib/components/Field.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { startDesktopSSO } from "$lib/desktop/sign-in";

  let email = $state("");
  let password = $state("");
  let code = $state("");
  let awaitingCode = $state(false);
  let error = $state<string | null>(null);
  let loading = $state(false);
  /** Only desktop leaves the sign-in screen up while the browser does its thing. */
  let waitingBrowser = $state(false);

  $effect(() => {
    if (auth.loaded && auth.signedIn) void goto("/calendar", { replaceState: true });
  });

  async function onSignIn() {
    error = null;
    loading = true;
    try {
      const signIn = await auth.signIn();
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await auth.activate(result.createdSessionId);
        await goto("/calendar", { replaceState: true });
        return;
      }
      // The account asks for a second step; Balance only offers the emailed code.
      await signIn.prepareSecondFactor({ strategy: "email_code" });
      awaitingCode = true;
    } catch (e) {
      error = authErrorMessage(e, "That email and password didn't match.");
    } finally {
      loading = false;
    }
  }

  async function onVerify() {
    error = null;
    loading = true;
    try {
      const signIn = await auth.signIn();
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await auth.activate(result.createdSessionId);
        await goto("/calendar", { replaceState: true });
      } else {
        error = "That code didn't work. Check the email and try again.";
      }
    } catch (e) {
      error = authErrorMessage(e, "That code didn't work.");
    } finally {
      loading = false;
    }
  }

  async function onSSO(strategy: "oauth_google" | "oauth_apple") {
    error = null;
    try {
      // Neither native build can run Clerk's redirect flow in its own webview, and each gets
      // around it differently: iOS has the OS's own account picker, macOS has a real browser
      // to send people to. Only the web gets the redirect flow it was written for.
      if (isDesktop) {
        waitingBrowser = true;
        // watchDesktopSignIn (registered app-wide) redeems the ticket when the browser sends one
        // back; auth.signedIn flipping true is what actually moves this screen on.
        await startDesktopSSO(strategy);
        return;
      }
      if (Capacitor.getPlatform() === "ios") {
        if (strategy === "oauth_google") await auth.signInWithNativeGoogle();
        else await auth.signInWithNativeApple();
        await goto("/calendar", { replaceState: true });
        return;
      }
      await auth.startSSO(strategy, "/calendar");
    } catch (e) {
      waitingBrowser = false;
      error = authErrorMessage(e, "Sign in didn't finish.");
    }
  }

  /** Can't close a tab in someone else's browser — this just stops waiting on it. */
  function cancelBrowserWait() {
    waitingBrowser = false;
  }
</script>

{#if awaitingCode}
  <AuthShell tagline="We sent a code to {email}.">
    <Field bind:value={code} placeholder="Verification code" inputmode="numeric" numeric />
    {#if error}<p class="t-label text-danger">{error}</p>{/if}
    <Button label="Verify" onclick={onVerify} {loading} disabled={!code} full />
  </AuthShell>
{:else}
  <AuthShell tagline="Pick up your week where you left it.">
    <div class="space-y-2">
      <Field bind:value={email} placeholder="Email" inputmode="email" />
      <Field bind:value={password} placeholder="Password" type="password" />
    </div>

    {#if error}<p class="t-label text-danger">{error}</p>{/if}

    <Button label="Sign in" onclick={onSignIn} {loading} disabled={!email || !password} full />

    <div class="flex items-center gap-3">
      <div class="flex-1"><Divider /></div>
      <span class="t-micro text-fg-faint">or</span>
      <div class="flex-1"><Divider /></div>
    </div>

    {#if waitingBrowser}
      <BrowserWait message="Waiting for you to finish signing in in the browser…" oncancel={cancelBrowserWait} />
    {:else}
      <div class="space-y-2">
        <Button label="Continue with Google" variant="outline" onclick={() => onSSO("oauth_google")} full>
          {#snippet icon()}
            <span
              class="block size-4 shrink-0"
              style="background-color: currentColor; -webkit-mask: url('/icons/google.png') center / contain no-repeat; mask: url('/icons/google.png') center / contain no-repeat;"
              aria-hidden="true"
            ></span>
          {/snippet}
        </Button>
        <Button label="Continue with Apple" variant="outline" onclick={() => onSSO("oauth_apple")} full>
          {#snippet icon()}
            <span
              class="block size-4 shrink-0"
              style="background-color: currentColor; -webkit-mask: url('/icons/apple.png') center / contain no-repeat; mask: url('/icons/apple.png') center / contain no-repeat;"
              aria-hidden="true"
            ></span>
          {/snippet}
        </Button>
      </div>
    {/if}

    <div class="flex justify-center gap-1">
      <span class="t-label text-fg-muted">New here?</span>
      <a href="/sign-up" class="t-label text-fg">Create an account</a>
    </div>
  </AuthShell>
{/if}
