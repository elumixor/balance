<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import AppLoading from "$lib/components/AppLoading.svelte";
  import SideNav from "$lib/components/nav/SideNav.svelte";
  import TabBar from "$lib/components/nav/TabBar.svelte";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import { desktopDock } from "$lib/desktop/dock";
  import { desktopReminders } from "$lib/desktop/reminders.svelte";
  import { desktopTray } from "$lib/desktop/tray.svelte";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { isBareKey, isSettingsKey } from "$lib/keys";
  import { icsImport } from "$lib/ics-import.svelte";
  import IcsDropZone from "$lib/components/IcsDropZone.svelte";
  import ImportIcsDialog from "$lib/components/ImportIcsDialog.svelte";
  import { mobileReminders } from "$lib/mobile/reminders.svelte";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { settings } from "$lib/settings.svelte";
  import { adoptUser, warmStore } from "$lib/store.svelte";
  import { startWatchHandoff } from "$lib/watch/handoff";
  import { untrack, type Snippet } from "svelte";
  import { page } from "$app/state";

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

  // On macOS the app is also the menu bar item, which outlives every screen — so it starts with
  // the session rather than with a route, and stops when the session goes. The Dock icon and the
  // reminders are the same kind of thing, running whether or not anybody is looking at a screen —
  // and on iOS the same reminders are handed to the system ahead of time, since that shell is
  // asleep by the time they are due.
  // The watch handoff belongs to the same list for the same reason: what it hands over is the
  // session itself, so it can only run while there is one.
  $effect(() => {
    if (!auth.signedIn) return;
    desktopTray.start();
    desktopDock.start();
    desktopUpdates.start();
    desktopReminders.start();
    mobileReminders.start();
    icsImport.start();
    const stopWatchHandoff = startWatchHandoff();
    return () => {
      desktopTray.stop();
      desktopDock.stop();
      desktopUpdates.stop();
      desktopReminders.stop();
      mobileReminders.stop();
      icsImport.stop();
      stopWatchHandoff();
    };
  });

  /**
   * The shell's own keys: a letter each for the two screens, and the settings combination (see
   * `SETTINGS_HOTKEY`). Bare letters only outside a text field — `c` is Calendar everywhere
   * except in the box where somebody is naming an event.
   */
  function onkeydown(e: KeyboardEvent) {
    if (isSettingsKey(e)) {
      e.preventDefault();
      return settings.toggle();
    }
    if (!isBareKey(e)) return;

    const tab = NAV_TABS.find((candidate) => candidate.key === e.key.toLowerCase());
    if (!tab || isActive(page.url.pathname, tab.href)) return;
    e.preventDefault();
    void goto(tab.href);
  }
</script>

<svelte:window {onkeydown} />

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
  <!-- Above the shell rather than inside the rail: the hotkey opens it from any screen, and on a
       phone there is no rail for it to hang off at all. -->
  <SettingsDialog />
  <!-- A file shared into the app can arrive on any screen, so the sheet that reads it lives here
       with the settings panel rather than on the calendar. -->
  <ImportIcsDialog />
  <!-- The other way a file arrives: dropped onto the Mac app or a browser tab, rather than shared
       into the phone. -->
  <IcsDropZone />
{/if}
