<script lang="ts">
  import { goto } from "$app/navigation";
  import { tick } from "svelte";
  import { auth } from "$lib/account/auth.svelte";
  import { telemetry } from "$lib/platform/telemetry";
  import { CalendarsSection } from "$lib/calendar/components";
  import { IntegrationsPane, NotificationsPane, PlacesPane, ProfilePane, SettingsGroup, SettingsNav, TimeZonesPane } from "./settings";
  import { type Pane, PANES } from "$lib/settings";
  import { preferences } from "$lib/account/preferences.svelte";
  import { settings } from "$lib/settings";
  import { clearStore } from "$lib/core/store.svelte";
  import { progressData } from "$lib/planning/progress.svelte";
  import { Dialog } from "$lib/components";

  /**
   * Everything about the account that isn't the week, on one page.
   *
   * One scroll, every section in order, and a rail beside it that says where you are and takes
   * you anywhere else in a click — the way an editor's settings work. A page per section, which
   * is what this was, made "is it under Planning or Reminders" a question with a wrong answer;
   * scrolling past a section costs nothing, and the search box in the rail skips even that.
   */

  /** Nothing here has a Save button, so a panel closing mid-edit still writes what it was given. */
  $effect(() => () => preferences.flush());

  /** How far below the top of the scroll a section has to reach to count as the one in view. */
  const IN_VIEW_PX = 48;

  let scroller = $state<HTMLDivElement | null>(null);
  let query = $state("");

  function sectionOf(pane: Pane) {
    return scroller?.querySelector<HTMLElement>(`[data-pane="${pane}"]`) ?? null;
  }

  function scrollTo(pane: Pane, smooth = true) {
    settings.pane = pane;
    sectionOf(pane)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "instant" });
  }

  /** The section the top of the scroll is in — or the last one, once the bottom is reached. */
  function onscroll() {
    if (!scroller) return;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if (atBottom) return void (settings.pane = PANES[PANES.length - 1].value);
    const top = scroller.scrollTop + IN_VIEW_PX;
    let current: Pane = PANES[0].value;
    for (const pane of PANES) {
      const section = sectionOf(pane.value);
      if (section && section.offsetTop <= top) current = pane.value;
    }
    settings.pane = current;
  }

  // Opened onto a section — the star badge, a card's "Integrations…" — the page starts there.
  $effect(() => {
    if (!settings.open) return;
    query = "";
    void tick().then(() => scrollTo(settings.pane, false));
  });

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
    <!-- The rail, on anything wide enough to put one beside the page. -->
    <div class="hidden w-52 shrink-0 overflow-y-auto border-r border-line bg-surface-alt md:block">
      <SettingsNav active={settings.pane} bind:query onselect={scrollTo} />
    </div>

    <!-- On a phone the same sections become a strip along the top: there is no room for a column
         beside the content, and a select would hide where you are. -->
    <!-- `pr-12` keeps the last one out from under the close button floating in the corner. -->
    <div class="no-scrollbar shrink-0 overflow-x-auto border-b border-line bg-surface-alt py-2 pr-12 pl-2 md:hidden">
      <div class="flex gap-1">
        {#each PANES as pane (pane.value)}
          {@const active = settings.pane === pane.value}
          <button
            type="button"
            aria-current={active ? "location" : undefined}
            onclick={() => scrollTo(pane.value)}
            class="press-sm flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5
              {active ? 'bg-surface text-fg' : 'text-fg-muted'}"
          >
            <pane.icon size={15} class={active ? "text-fg" : "text-fg-faint"} />
            <span class="t-label whitespace-nowrap">{pane.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div bind:this={scroller} {onscroll} class="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6 md:pr-12">
      {#each PANES as pane, index (pane.value)}
        <section data-pane={pane.value} class="scroll-mt-5 {index > 0 ? 'mt-8 border-t border-line pt-7' : ''} md:scroll-mt-6">
          {#if pane.value === "general"}
            <ProfilePane onsignout={() => void signOut()} />
          {:else if pane.value === "notifications"}
            <NotificationsPane />
          {:else if pane.value === "places"}
            <PlacesPane />
          {:else if pane.value === "zones"}
            <TimeZonesPane />
          {:else if pane.value === "integrations"}
            <IntegrationsPane />
          {:else}
            <SettingsGroup title="Calendars" note="Which calendars are drawn, and where new events land." divided={false}>
              <CalendarsSection />
            </SettingsGroup>
          {/if}
        </section>
      {/each}

    </div>
  </div>
</Dialog>
