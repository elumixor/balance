<script lang="ts">
  import { page } from "$app/state";
  import Spinner from "$lib/components/Spinner.svelte";
  import { isActive, NAV_TABS } from "$lib/nav";

  /** The phone's navigation, under the thumb. Replaced by SideNav from `md` up. */
</script>

<nav class="safe-bottom flex border-t border-line bg-surface md:hidden">
  {#each NAV_TABS as tab (tab.href)}
    {@const active = isActive(page.url.pathname, tab.href)}
    <a
      href={tab.href}
      aria-current={active ? "page" : undefined}
      aria-busy={tab.syncing()}
      class="flex flex-1 flex-col items-center gap-1 py-2 {active ? 'text-fg' : 'text-fg-faint'}"
    >
      <!-- The spinner rides the icon's corner rather than the row, so a tab that starts syncing
           doesn't shove the two labels sideways. -->
      <span class="relative">
        <tab.icon size={20} />
        {#if tab.syncing()}
          <span class="absolute -top-0.5 -right-1.5"><Spinner size={10} /></span>
        {/if}
      </span>
      <span class="t-micro">{tab.label}</span>
    </a>
  {/each}
</nav>
