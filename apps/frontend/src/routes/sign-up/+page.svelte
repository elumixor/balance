<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth, authErrorMessage } from "$lib/auth.svelte";
  import AuthShell from "$lib/components/AuthShell.svelte";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
  import { diagnostics } from "$lib/diagnostics.svelte";

  let email = $state("");
  let password = $state("");
  let code = $state("");
  let awaitingCode = $state(false);
  let loading = $state(false);

  async function onSignUp() {
    loading = true;
    try {
      const signUp = await auth.signUp();
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      awaitingCode = true;
    } catch (e) {
      fail(e, "Couldn’t create that account.");
    } finally {
      loading = false;
    }
  }

  async function onVerify() {
    loading = true;
    try {
      const signUp = await auth.signUp();
      const result = await signUp.attemptEmailAddressVerification({ code });
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

  /**
   * Every way this screen can fail says so in the app's one place for that — the corner — rather
   * than growing a line of its own under the fields. What Clerk says is already a sentence, so it
   * is the whole of the card; the technical half rides along behind the copy.
   */
  function fail(error: unknown, fallback: string) {
    diagnostics.report("Sign-up", error ?? fallback, { title: authErrorMessage(error, fallback) });
  }
</script>

<AuthShell
  tagline={awaitingCode
    ? `We sent a six-digit code to ${email}.`
    : "Decide how your week should go, then see how it went."}
>
  {#if awaitingCode}
    <Field bind:value={code} placeholder="Verification code" inputmode="numeric" numeric />
    <Button label="Verify" onclick={onVerify} {loading} disabled={!code} full />
  {:else}
    <div class="space-y-2">
      <Field bind:value={email} placeholder="Email" inputmode="email" />
      <Field bind:value={password} placeholder="Password" type="password" />
    </div>
    <Button label="Sign up" onclick={onSignUp} {loading} disabled={!email || !password} full />
    <div class="flex justify-center gap-1">
      <span class="t-label text-fg-muted">Already have an account?</span>
      <a href="/sign-in" class="t-label text-fg">Sign in</a>
    </div>
  {/if}
</AuthShell>
