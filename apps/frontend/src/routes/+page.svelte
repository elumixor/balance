<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/account/auth.svelte";
  import { AppLoading } from "$lib/components";

  // Nowhere to send anyone if Clerk never started — AppLoading says so instead.
  $effect(() => {
    if (auth.loaded && !auth.startupError) void goto(auth.signedIn ? "/calendar" : "/sign-in", { replaceState: true });
  });
</script>

<AppLoading />
