<script lang="ts">
  import { page } from "$app/state";
  import { NAV_TABS } from "$lib/nav";

  /** The phone's navigation, under the thumb. Replaced by SideNav from `md` up. */
</script>

<nav class="safe-bottom flex border-t border-line bg-surface md:hidden">
  {#each NAV_TABS as tab (tab.href)}
    {@const active = page.url.pathname === tab.href}
    <a
      href={tab.href}
      aria-current={active ? "page" : undefined}
      class="flex flex-1 flex-col items-center gap-1 py-2 {active ? 'text-fg' : 'text-fg-faint'}"
    >
      <tab.icon size={20} />
      <span class="t-micro">{tab.label}</span>
    </a>
  {/each}
</nav>
