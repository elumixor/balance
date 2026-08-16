<script lang="ts">
  import { page } from "$app/state";
  import { auth } from "$lib/auth.svelte";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { sidePanel } from "./side-panel.svelte";

  /**
   * The wide-screen rail. Where the tab bar can only afford an icon, this has room for the
   * mark, the four screens as a read-down list, the current screen's own controls, and the
   * account — so no screen has to carry chrome that isn't its own content.
   *
   * On macOS the window has no title bar of its own — the rail runs to the top of the window and
   * the close/minimise/zoom buttons sit over it, which is where the extra top padding goes. The
   * window's minimum width keeps the rail on screen so they always have this to sit on.
   */
</script>

<nav
  class="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 pb-6 md:flex {isDesktop
    ? 'pt-11'
    : 'pt-6'}"
>
  <div class="mb-8 flex items-center gap-2.5 px-2">
    <BrandMark size={26} />
    <span class="t-heading">Balance</span>
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

  <div class="mt-auto flex items-center gap-2.5 px-1 pt-6">
    <AccountMenu />
    {#if auth.email}
      <span class="t-micro min-w-0 flex-1 truncate text-fg-faint">{auth.email}</span>
    {/if}
  </div>
</nav>
