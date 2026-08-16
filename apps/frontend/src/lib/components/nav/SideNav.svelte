<script lang="ts">
  import { page } from "$app/state";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { sidePanel } from "./side-panel.svelte";

  /**
   * The wide-screen rail: the screens as a read-down list, the current screen's own controls, and
   * the account — so no screen has to carry chrome that isn't its own content. No mark and no
   * wordmark; giving the rail's first inch to a logo costs real room and says nothing.
   *
   * On macOS the window has no title bar of its own, so the close/minimise/zoom buttons land on
   * the rail. The account button sits in that same strip, indented past them — one top row of
   * round controls rather than a system half and an app half at different heights. In a browser
   * there are no such buttons and the indent goes away.
   */
</script>

<nav
  class="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 pb-6 md:flex {isDesktop
    ? 'pt-0'
    : 'pt-3'}"
>
  <!-- On macOS this strip is the window's title bar, and `h-9` is the height that centres the
       account button on the same line as the window buttons it sits beside. -->
  <div class="mb-4 flex items-center {isDesktop ? 'h-9 pl-[78px]' : 'px-1'}">
    <AccountMenu align="start" compact />
  </div>

  <div class="flex flex-col gap-0.5">
    {#each NAV_TABS as tab (tab.href)}
      {@const active = isActive(page.url.pathname, tab.href)}
      <a
        href={tab.href}
        aria-current={active ? "page" : undefined}
        aria-busy={tab.syncing()}
        class="flex items-center gap-3 rounded-md px-3 py-2.5 {active
          ? 'bg-surface-alt text-fg'
          : 'hoverable text-fg-muted'}"
      >
        <tab.icon size={18} />
        <span class="t-label flex-1">{tab.label}</span>
        <!-- The row's one trailing mark: a spinner while the screen's data is being checked,
             the you-are-here dot the rest of the time. -->
        {#if tab.syncing()}
          <Spinner size={12} />
        {:else if active}
          <span class="size-1.5 rounded-full bg-ink"></span>
        {/if}
      </a>
    {/each}
  </div>

  {#if sidePanel.section}
    <div class="mt-6 min-h-0 border-t border-line pt-6">
      {@render sidePanel.section()}
    </div>
  {/if}
</nav>
