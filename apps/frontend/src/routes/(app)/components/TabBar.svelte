<script lang="ts">
  import { page } from "$app/state";
  import { Spinner } from "$lib/components";
  import { isIOSApp } from "$lib/mobile/platform";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { Haptics, ImpactStyle } from "@capacitor/haptics";

  /**
   * The phone's navigation, under the thumb. Replaced by SideNav from `md` up.
   *
   * The lit tab wears a pill behind its glyph rather than only a darker colour: three grey icons
   * in a row read as three of the same thing, and the pill is what says which one you are on
   * before the label is read. On the phone a change of tab is also felt, the way the system's own
   * tab bars are.
   */
  function onTap(active: boolean) {
    if (active || !isIOSApp) return;
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }
</script>

<nav class="safe-bottom flex border-t border-line bg-surface md:hidden">
  {#each NAV_TABS as tab (tab.href)}
    {@const active = isActive(page.url.pathname, tab.href)}
    <a
      href={tab.href}
      aria-current={active ? "page" : undefined}
      aria-busy={tab.syncing()}
      onclick={() => onTap(active)}
      class="press-sm flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 {active ? 'text-fg' : 'text-fg-faint'}"
    >
      <!-- The spinner rides the pill's corner rather than the row, so a tab that starts syncing
           doesn't shove the two labels sideways. -->
      <span
        class="relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150
          {active ? 'bg-surface-alt' : ''}"
      >
        <tab.icon size={20} strokeWidth={active ? 2.25 : 1.75} />
        {#if tab.syncing()}
          <span class="absolute top-0 right-1"><Spinner size={10} /></span>
        {/if}
      </span>
      <span class="t-micro">{tab.label}</span>
    </a>
  {/each}
</nav>
