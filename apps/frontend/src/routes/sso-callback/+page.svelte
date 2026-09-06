<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/account/auth.svelte";
  import { AppLoading } from "$lib/components";

  // Where Clerk drops the browser after a provider round-trip; it reads the result
  // off the URL, activates the session and moves on.
  $effect(() => {
    auth.handleRedirectCallback("/calendar").catch(() => goto("/sign-in", { replaceState: true }));
  });
</script>

<AppLoading />
