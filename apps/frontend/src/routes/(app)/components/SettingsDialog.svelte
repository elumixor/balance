<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { telemetry } from "$lib/telemetry";
  import { CalendarsSection } from "$lib/calendar/components";
  import { IntegrationsPane, NotificationsPane, PlacesPane, ProfilePane, SettingsGroup, SettingsNav, TimeZonesPane } from "./settings";
  import { PANES } from "$lib/settings";
  import { preferences } from "$lib/preferences.svelte";
  import { settings } from "$lib/settings";
  import { clearStore } from "$lib/store.svelte";
  import { progressData } from "$lib/planning/progress.svelte";
  import { Dialog } from "$lib/components";

  /**
   * Everything about the account that isn't the week.
   *
   * A rail of pages down one side and one page at a time beside it, rather than every section at
   * once. Six sections in a single scroll meant every visit began by scrolling past the five you
   * didn't come for; boxing each of them in a card, which is what this was before, only drew
   * borders around that same problem. A page is one subject, headings and controls, with nothing
   * else on screen competing to be read.
   */

  /** Nothing here has a Save button, so a panel closing mid-edit still writes what it was given. */
  $effect(() => () => preferences.flush());

  async function signOut() {
    settings.hide();
    await auth.signOut();
    // The next account is not this one, and nothing it does should be filed under this one.
    telemetry.forget();
    // Whatever is cached belongs to the account that just left.
    await clearStore();
    progressData.reset();
    await goto("/sign-in");
  }
</script>

<Dialog title="Settings" open={settings.open} size="split" onclose={() => settings.hide()}>
  <div class="flex h-[82dvh] min-h-0 flex-col sm:h-[76vh] sm:max-h-[680px] md:flex-row">
    <!-- The rail, on anything wide enough to put one beside a page. -->
    <div class="hidden w-56 shrink-0 overflow-y-auto border-r border-line bg-surface-alt md:block">
      <SettingsNav bind:pane={settings.pane} />
    </div>

    <!-- On a phone the same pages become a strip along the top: there is no room for a column
         beside the content, and a select would hide where you are. -->
    <!-- `pr-12` keeps the last page out from under the close button floating in the corner. -->
    <div class="no-scrollbar shrink-0 overflow-x-auto border-b border-line bg-surface-alt py-2 pr-12 pl-2 md:hidden">
      <div class="flex gap-1">
        {#each PANES as page (page.value)}
          {@const active = settings.pane === page.value}
          <button
            type="button"
            aria-current={active ? "page" : undefined}
            onclick={() => (settings.pane = page.value)}
            class="press-sm flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5
              {active ? 'bg-surface text-fg' : 'text-fg-muted'}"
          >
            <page.icon size={15} class={active ? "text-fg" : "text-fg-faint"} />
            <span class="t-label whitespace-nowrap">{page.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 md:px-6 md:py-6 md:pr-12">
      {#if settings.pane === "general"}
        <ProfilePane onsignout={() => void signOut()} />
      {:else if settings.pane === "notifications"}
        <NotificationsPane />
      {:else if settings.pane === "places"}
        <PlacesPane />
      {:else if settings.pane === "zones"}
        <TimeZonesPane />
      {:else if settings.pane === "integrations"}
        <IntegrationsPane />
      {:else}
        <SettingsGroup title="Calendars" note="Which calendars are drawn, and where new events land." divided={false}>
          <CalendarsSection />
        </SettingsGroup>
      {/if}
    </div>
  </div>
</Dialog>
