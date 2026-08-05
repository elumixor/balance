<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth, authErrorMessage } from "$lib/auth.svelte";
  import AuthShell from "$lib/components/AuthShell.svelte";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";

  let email = $state("");
  let password = $state("");
  let code = $state("");
  let awaitingCode = $state(false);
  let error = $state<string | null>(null);
  let loading = $state(false);

  async function onSignUp() {
    error = null;
    loading = true;
    try {
      const signUp = await auth.signUp();
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      awaitingCode = true;
    } catch (e) {
      error = authErrorMessage(e, "Couldn't create that account.");
    } finally {
      loading = false;
    }
  }

  async function onVerify() {
    error = null;
    loading = true;
    try {
      const signUp = await auth.signUp();
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await auth.activate(result.createdSessionId);
        await goto("/track", { replaceState: true });
      } else {
        error = "That code didn't work. Check the email and try again.";
      }
    } catch (e) {
      error = authErrorMessage(e, "That code didn't work.");
    } finally {
      loading = false;
    }
  }
</script>

<AuthShell
  tagline={awaitingCode
    ? `We sent a six-digit code to ${email}.`
    : "Decide how your week should go, then see how it went."}
>
  {#if awaitingCode}
    <Field bind:value={code} placeholder="Verification code" inputmode="numeric" mono />
    {#if error}<p class="t-label text-danger">{error}</p>{/if}
    <Button label="Verify" onclick={onVerify} {loading} disabled={!code} />
  {:else}
    <div class="space-y-2">
      <Field bind:value={email} placeholder="Email" inputmode="email" />
      <Field bind:value={password} placeholder="Password" type="password" />
    </div>
    {#if error}<p class="t-label text-danger">{error}</p>{/if}
    <Button label="Sign up" onclick={onSignUp} {loading} disabled={!email || !password} />
    <div class="flex justify-center gap-1">
      <span class="t-label text-fg-muted">Already have an account?</span>
      <a href="/sign-in" class="t-label text-fg">Sign in</a>
    </div>
  {/if}
</AuthShell>
