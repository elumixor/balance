<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/account/auth.svelte";
  import { AppLoading } from "$lib/components";
  import { IcsDropZone, ImportIcsDialog, NavStrip, SessionNudge, SettingsDialog, SideNav, TabBar } from "./components";
  import { isBareKey, isRefreshKey, isSettingsKey } from "$lib/platform/keys";
  import { syncStatus } from "$lib/core/synced.svelte";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { clock } from "$lib/platform/clock.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { startShellServices } from "$lib/shell-services";
  import { settings } from "$lib/settings";
  import { telemetry } from "$lib/platform/telemetry";
  import { adoptUser, refreshStore, warmStore } from "$lib/core/store.svelte";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
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
      warmStore().catch((e) => diagnostics.report("Loading", e, { title: "Couldn’t load your data", retry: warmStore }));
    });
  });

  // The write queue answers to nobody: it runs whether or not a screen is open, and a transport
  // failure there is why categories can quietly stop arriving. A refused write has a screen to
  // show it — see `syncStatus.rejected` — but a sync that can't reach the server has none.
  $effect(() => {
    const error = syncStatus.error;
    if (error) diagnostics.report("Sync", error, { title: "Couldn’t save your changes" });
  });

  // The menu bar item, the Dock icon, the reminders, the watch handoff: things that outlive every
  // screen, so they start with the session rather than with a route and stop when it goes.
  $effect(() => {
    if (!auth.signedIn) return;
    return startShellServices();
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
    // Refetches everything behind what's on screen rather than reloading the page, which would
    // drop the session and redraw the rows the person has just stopped trusting.
    if (isRefreshKey(e)) {
      e.preventDefault();
      return void refreshStore().catch((e) =>
        diagnostics.report("Loading", e, { title: "Couldn’t refresh your data", retry: refreshStore }),
      );
    }
    if (!isBareKey(e)) return;

    const tab = NAV_TABS.find((candidate) => candidate.key === e.key.toLowerCase());
    if (!tab || isActive(page.url.pathname, tab.href)) return;
    e.preventDefault();
    void goto(tab.href);
  }

  /**
   * A screen that threw says so in the corner like everything else, with `reset` as its retry —
   * nothing here holds state the store doesn't hold for it, so building it again is free.
   */
  function report(error: unknown, reset: () => void) {
    diagnostics.report("Screen", error, { title: "This screen didn’t draw", retry: reset });
    return "";
  }
</script>

<svelte:window {onkeydown} />

{#if !shellReady}
  <AppLoading />
{:else}
  <!-- One shell, two shapes: tabs under the thumb on a phone, a strip floating in the top-left
       corner on a desktop, with a panel under it on the one screen that has one. `relative` is
       what the strip is placed against. -->
  <div class="flex h-dvh flex-col bg-bg">
    <!-- The status bar's ground on a phone: screens scroll under the clock, and this keeps their
         rows from colliding with it the way the system's own bars do. -->
    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-40 h-[var(--safe-top)] bg-bg/75 backdrop-blur-md md:hidden"
    ></div>
    <div class="relative flex min-h-0 flex-1">
      <NavStrip />
      <SideNav />
      <div class="flex min-w-0 flex-1 flex-col">
        <!-- The screen scrolls itself, not the page: the strip and the tab bar stay put, and a
             screen that wants the whole height (the calendar) can take it. -->
        <main class="min-h-0 flex-1 overflow-hidden">
          <!-- A screen that throws while rendering used to take the whole shell down with it: the
               tabs stayed drawn and stopped answering, which reads as an app that is still loading.
               The boundary keeps the shell alive, says what happened, and lets the screen be built
               again — nothing here holds state that the store doesn't hold for it. -->
          <svelte:boundary>
            {@render children()}
            {#snippet failed(error, reset)}
              <!-- Nothing is drawn here: the corner says a screen didn't draw, and carries the way
                   to build it again. Anything drawn in its place would be a second answer to the
                   same question, in the one spot the screen it replaces was supposed to be. -->
              {@const said = report(error, reset)}
              <div class="hidden">{said}</div>
            {/snippet}
          </svelte:boundary>
        </main>
        <TabBar />
      </div>
    </div>
    <!-- A notification rather than a screen: one more card in the corner's pile. -->
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
