<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import AppLoading from "$lib/components/AppLoading.svelte";
  import SideNav from "$lib/components/nav/SideNav.svelte";
  import TabBar from "$lib/components/nav/TabBar.svelte";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    if (auth.loaded && !auth.startupError && !auth.signedIn) void goto("/sign-in", { replaceState: true });
  });
</script>

{#if !auth.loaded || !auth.signedIn}
  <AppLoading />
{:else}
  <!-- One shell, two shapes: tabs under the thumb on a phone, a rail beside the work on a desktop. -->
  <div class="flex h-dvh bg-bg">
    <SideNav />
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- The content column scrolls, not the page: the rail and the tab bar stay put. -->
      <main class="flex-1 overflow-y-auto">
        {@render children()}
      </main>
      <TabBar />
    </div>
  </div>
{/if}
