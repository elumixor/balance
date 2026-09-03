<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import AppLoading from "$lib/components/AppLoading.svelte";
  import SideNav from "$lib/components/nav/SideNav.svelte";
  import TabBar from "$lib/components/nav/TabBar.svelte";
  import SessionNudge from "$lib/components/SessionNudge.svelte";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import { desktopDock } from "$lib/desktop/dock";
  import { desktopReminders } from "$lib/desktop/reminders.svelte";
  import { desktopTray } from "$lib/desktop/tray.svelte";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { isBareKey, isSettingsKey } from "$lib/keys";
  import { syncStatus } from "$lib/synced.svelte";
  import { icsImport } from "$lib/ics-import.svelte";
  import { integrations } from "$lib/integrations/integrations.svelte";
  import IcsDropZone from "$lib/components/IcsDropZone.svelte";
  import ImportIcsDialog from "$lib/components/ImportIcsDialog.svelte";
  import { mobileReminders } from "$lib/mobile/reminders.svelte";
  import { sessionReminders } from "$lib/mobile/session-reminders.svelte";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { clock } from "$lib/clock.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { settings } from "$lib/settings.svelte";
  import { telemetry } from "$lib/telemetry";
  import { adoptUser, warmStore } from "$lib/store.svelte";
  import { diagnostics } from "$lib/diagnostics.svelte";
  import ScreenFailed from "$lib/components/ScreenFailed.svelte";
  import { startWatchHandoff } from "$lib/watch/handoff";
  import { untrack, type Snippet } from "svelte";
  import { page } from "$app/state";

  let { children }: { children: Snippet } = $props();

  /**
   * A device that was signed in last time gets its shell — and the rows the store read back off
   * disk — before Clerk has confirmed anything, so reopening the app is a screen rather than a
   * splash. If the session turns out to be gone, the effect below moves on to sign-in.
   *
   * A start-up that failed takes the optimistic shell back down: nothing here ever gets a token,
   * so every screen under it would skeleton behind a tab bar that does nothing. The splash says
   * what went wrong and offers to try again instead.
   */
  const shellReady = $derived(auth.signedIn || (!auth.loaded && auth.wasSignedIn && !auth.startupError));

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
      // Everything reported from here on belongs to an account rather than to a browser.
      telemetry.identify(userId, auth.email);
      warmStore().catch((e) => diagnostics.report("Loading", e));
    });
  });

  // The write queue answers to nobody: it runs whether or not a screen is open, and a transport
  // failure there is why categories can quietly stop arriving. A refused write has a screen to
  // show it — see `syncStatus.rejected` — but a sync that can't reach the server has none.
  $effect(() => {
    const error = syncStatus.error;
    if (error) diagnostics.report("Sync", error);
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
    sessionReminders.start();
    sessionNudge.start();
    icsImport.start();
    integrations.start();
    const stopWatchHandoff = startWatchHandoff();
    return () => {
      desktopTray.stop();
      desktopDock.stop();
      desktopUpdates.stop();
      desktopReminders.stop();
      mobileReminders.stop();
      sessionReminders.stop();
      sessionNudge.stop();
      icsImport.stop();
      integrations.stop();
      stopWatchHandoff();
    };
  });

  // The sitting is owed on a clock, not on a route: the tick is what notices the slot coming round
  // while somebody is looking at the week. Only the clock is read here — asking costs a request at
  // most twice a day, and the answer is state the nudge reads for itself.
  $effect(() => {
    void clock.now;
    void untrack(() => sessionNudge.check());
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
  <!-- One shell, two shapes: tabs under the thumb on a phone, a rail beside the work on a desktop —
       or, on a screen with nothing to put in a rail, the rail's strip alone in the same corner.
       `relative` is what the floating strip is placed against. -->
  <div class="flex h-dvh flex-col bg-bg">
    <div class="relative flex min-h-0 flex-1">
      <SideNav />
      <div class="flex min-w-0 flex-1 flex-col">
        <!-- The screen scrolls itself, not the page: the strip and the tab bar stay put, and a
             screen that wants the whole height (the calendar) can take it. -->
        <main class="min-h-0 flex-1 overflow-hidden">
          <!-- A screen that throws while rendering used to take the whole shell down with it: the
               tabs stayed drawn and stopped answering, which reads as an app that is still loading.
               The boundary keeps the shell alive, says what happened, and lets the screen be built
               again — nothing here holds state that the store doesn't hold for it. -->
          <svelte:boundary onerror={(e) => diagnostics.report("Screen", e)}>
            {@render children()}
            {#snippet failed(error, reset)}
              <ScreenFailed {error} {reset} />
            {/snippet}
          </svelte:boundary>
        </main>
        <TabBar />
      </div>
    </div>
    <!-- A notification rather than a screen: top-right on a desktop, above the bar on a phone. -->
    <SessionNudge />
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
