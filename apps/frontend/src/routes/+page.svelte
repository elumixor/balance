<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import AppLoading from "$lib/components/AppLoading.svelte";

  $effect(() => {
    if (auth.loaded) void goto(auth.signedIn ? "/track" : "/sign-in", { replaceState: true });
  });
</script>

<AppLoading />
