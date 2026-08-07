<script lang="ts">
  import { page } from "$app/state";
  import { auth } from "$lib/auth.svelte";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import { NAV_TABS } from "$lib/nav";

  /**
   * The wide-screen rail. Where the tab bar can only afford an icon, this has room for the
   * mark, the four screens as a read-down list, and the account — so no screen has to carry
   * chrome that isn't its own content.
   */
</script>

<nav class="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-6 md:flex">
  <div class="mb-8 flex items-center gap-2.5 px-2">
    <BrandMark size={26} />
    <span class="t-heading">Balance</span>
  </div>

  <div class="flex flex-col gap-0.5">
    {#each NAV_TABS as tab (tab.href)}
      {@const active = page.url.pathname === tab.href}
      <a
        href={tab.href}
        aria-current={active ? "page" : undefined}
        class="flex items-center gap-3 rounded-md px-3 py-2.5 {active
          ? 'bg-surface-alt text-fg'
          : 'hoverable text-fg-muted'}"
      >
        <tab.icon size={18} />
        <span class="t-label flex-1">{tab.label}</span>
        {#if active}<span class="size-1.5 rounded-full bg-ink"></span>{/if}
      </a>
    {/each}
  </div>

  <div class="mt-auto flex items-center gap-2.5 px-1">
    <AccountMenu />
    {#if auth.email}
      <span class="t-micro min-w-0 flex-1 truncate text-fg-faint">{auth.email}</span>
    {/if}
  </div>
</nav>
