<script lang="ts">
  import { page } from "$app/state";
  import { auth, authErrorMessage } from "$lib/account/auth.svelte";
  import { AuthShell, Button, Spinner } from "$lib/components";
  import { answerConsent, describeClient, readConsentRequest } from "$lib/mcp/consent";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";

  /**
   * The consent screen, and the only reason there is an authorization server here at all.
   *
   * An assistant that can be given nothing but a URL — Claude's web connector — has no field for a
   * key, so the way in has to be a page a person looks at. This is that page: it says who is
   * asking and where they would be sent back to, and its Allow is what mints the key.
   *
   * Signing in is part of it rather than before it. Somebody arriving from another tab has no
   * session here, and bouncing them to `/sign-in` would lose the request they arrived with — so
   * the sign-in happens in place, and the request survives in the URL it came in on.
   */
  const request = $derived(readConsentRequest(page.url.searchParams));

  let asking = $state<{ name: string; redirectUri: string } | null>(null);
  let deciding = $state(false);
  let refused = $state<string | null>(null);
  /** One failure stops the effects asking again; the card in the corner carries the way back. */
  let failed = $state(false);

  $effect(() => {
    if (!auth.loaded || auth.signedIn || failed || !request) return;
    void auth.startSSO("oauth_google", `/authorize${page.url.search}`).catch((e) => {
      failed = true;
      diagnostics.report("Sign-in", e, { title: authErrorMessage(e, "Sign in didn’t finish.") });
    });
  });

  $effect(() => {
    if (!auth.signedIn || asking || failed || !request) return;
    const { clientId, redirectUri } = request;
    void describeClient(clientId, redirectUri)
      .then((client) => (asking = client))
      .catch((e) => {
        failed = true;
        // Not a toast in the corner: this page has nothing else on it, and the person is here to
        // decide about a request that turns out to be malformed.
        refused = e instanceof Error ? e.message : "That request can’t be answered.";
      });
  });

  async function decide(decision: "allow" | "deny") {
    if (!request || deciding) return;
    deciding = true;
    try {
      window.location.href = await answerConsent(decision, request);
    } catch (e) {
      deciding = false;
      diagnostics.report("Assistants", e, { title: "Couldn’t answer that request" });
    }
  }
</script>

<AuthShell tagline={asking ? `${asking.name} would like to use your Balance account.` : "Connecting an assistant."}>
  {#if !request}
    <p class="t-body text-fg-muted">
      This page answers an assistant’s request to connect, and this one arrived without enough of it
      to answer. Start again from the assistant.
    </p>
  {:else if refused}
    <p class="t-body text-fg-muted">{refused}</p>
  {:else if !asking}
    <div class="flex justify-center"><Spinner /></div>
  {:else}
    <div class="space-y-4">
      <div class="space-y-2 rounded-md border border-line bg-surface-alt p-3">
        <p class="t-label text-fg">It would be able to</p>
        <ul class="t-body space-y-1 text-fg-muted">
          <li>Read your week, your spheres, your projects and your stars</li>
          <li>Add, move, delete and categorise blocks on your calendar</li>
          <li>Start and stop tracking</li>
        </ul>
      </div>
      <p class="t-micro text-fg-faint">
        It will be sent back to <span class="text-fg-muted">{asking.redirectUri}</span>. You can take
        this back at any time in Settings → Assistants.
      </p>
      <div class="flex gap-2">
        <Button label="Allow" full loading={deciding} onclick={() => void decide("allow")} />
        <Button label="Refuse" variant="outline" onclick={() => void decide("deny")} />
      </div>
    </div>
  {/if}
</AuthShell>
