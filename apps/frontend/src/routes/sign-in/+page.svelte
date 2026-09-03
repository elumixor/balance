<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { goto } from "$app/navigation";
  import { auth, authErrorMessage } from "$lib/auth.svelte";
  import { AuthShell, BrowserWait, Button, Divider, Field } from "$lib/components";
  import { isDesktop } from "$lib/desktop/platform";
  import { startDesktopSSO } from "$lib/desktop/sign-in";
  import { diagnostics } from "$lib/diagnostics.svelte";

  let email = $state("");
  let password = $state("");
  let code = $state("");
  let awaitingCode = $state(false);
  let loading = $state(false);
  /** Only desktop leaves the sign-in screen up while the browser does its thing. */
  let waitingBrowser = $state(false);

  $effect(() => {
    if (auth.loaded && auth.signedIn) void goto("/calendar", { replaceState: true });
  });

  async function onSignIn() {
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
      fail(e, "That email and password didn’t match.");
    } finally {
      loading = false;
    }
  }

  async function onVerify() {
    loading = true;
    try {
      const signIn = await auth.signIn();
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await auth.activate(result.createdSessionId);
        await goto("/calendar", { replaceState: true });
      } else {
        fail(null, "That code didn’t work. Check the email and try again.");
      }
    } catch (e) {
      fail(e, "That code didn’t work.");
    } finally {
      loading = false;
    }
  }

  async function onSSO(strategy: "oauth_google" | "oauth_apple") {
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
      fail(e, "Sign in didn’t finish.");
    }
  }

  /** Can't close a tab in someone else's browser — this just stops waiting on it. */
  function cancelBrowserWait() {
    waitingBrowser = false;
  }

  /**
   * Every way this screen can fail says so in the app's one place for that — the corner — rather
   * than growing a line of its own under the fields. What Clerk says is already a sentence, so it
   * is the whole of the card; the technical half rides along behind the copy.
   */
  function fail(error: unknown, fallback: string) {
    diagnostics.report("Sign-in", error ?? fallback, { title: authErrorMessage(error, fallback) });
  }
</script>

{#if awaitingCode}
  <AuthShell>
    <Field bind:value={code} placeholder="Verification code" inputmode="numeric" numeric />
    <Button label="Verify" onclick={onVerify} {loading} disabled={!code} full />
  </AuthShell>
{:else}
  <AuthShell>
    <div class="space-y-2">
      <Field bind:value={email} placeholder="Email" inputmode="email" />
      <Field bind:value={password} placeholder="Password" type="password" />
    </div>


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
