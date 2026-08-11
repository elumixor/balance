<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import AppLoading from "$lib/components/AppLoading.svelte";
  import SideNav from "$lib/components/nav/SideNav.svelte";
  import TabBar from "$lib/components/nav/TabBar.svelte";
  import { adoptUser, warmStore } from "$lib/store.svelte";
  import { untrack, type Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  /**
   * A device that was signed in last time gets its shell — and the rows the store read back off
   * disk — before Clerk has confirmed anything, so reopening the app is a screen rather than a
   * splash. If the session turns out to be gone, the effect below moves on to sign-in.
   */
  const shellReady = $derived(auth.signedIn || (!auth.loaded && auth.wasSignedIn));

  $effect(() => {
    if (auth.loaded && !auth.startupError && !auth.signedIn) void goto("/sign-in", { replaceState: true });
  });

  // Every tab's data, fetched together the moment there's a session to fetch it with. The rows
  // read back off the device are already on screen by now; this is the pass that checks them.
  // Untracked: warming reads every cache, and tracking those reads would turn this into a
  // loop that refetches the world each time a write marks something stale.
  $effect(() => {
    if (!auth.signedIn) return;
    const userId = auth.userId;
    untrack(() => {
      // Before the first request, in case what's on screen belongs to whoever signed in last.
      if (userId) adoptUser(userId);
      void warmStore();
    });
  });
</script>

{#if !shellReady}
  <AppLoading />
{:else}
  <!-- One shell, two shapes: tabs under the thumb on a phone, a rail beside the work on a desktop. -->
  <div class="flex h-dvh bg-bg">
    <SideNav />
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- The screen scrolls itself, not the page: the rail and the tab bar stay put, and a
           screen that wants the whole height (the calendar) can take it. -->
      <main class="min-h-0 flex-1 overflow-hidden">
        {@render children()}
      </main>
      <TabBar />
    </div>
  </div>
{/if}
