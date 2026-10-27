<script lang="ts">
  import { page } from "$app/state";
  import { AccountPill, Tooltip } from "$lib/components";
  import { isDesktop } from "$lib/desktop/platform";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { shellSlots } from "$lib/nav/shell-slots.svelte";
  import { palette } from "$lib/search";
  import { Search } from "lucide-svelte";

  /**
   * The wide-screen strip. Everything that isn't the current screen's own controls fits on one
   * line: where you are on the left, who you are on the right. Three destinations don't need a
   * read-down list with their names spelled out — the icons are the whole vocabulary, and
   * hovering one says the name and the key that gets there.
   *
   * A screen that is somewhere in particular says so on this
   * same line rather than spending a row of its own on a breadcrumb (`ShellSlot slot="where"`).
   * The strip keeps the rail's width when nothing is handed to it, so the calendar's panel and the
   * account still line up the way they always have.
   *
   * One strip, floating in the top-left corner of every screen. On the calendar it lands on the
   * empty top of the left panel; elsewhere on the screen's own top padding. Either way the icons
   * stay where the hand learned them, and no screen gives up a bar's height to them.
   *
   * On macOS the window has no title bar of its own, so the close/minimise/zoom buttons land on
   * this same line, and the strip is indented past them. In a browser the indent goes away and the
   * icons start at the edge.
   */
</script>

<!-- `select-none`: none of this is text anyone means to copy, and a drag across it should move the
     window rather than paint a selection over it. On macOS `h-9` is the title bar's height, which
     is what puts these on the window buttons' own line. `data-tauri-drag-region` makes the strip
     behave like the title bar it covers — the attribute is read off the event target, so every
     button on it stays a button, and the spacer carries it too or the widest part of the strip
     wouldn't drag. -->
<div
  data-tauri-drag-region={isDesktop ? true : undefined}
  class="absolute top-0 left-0 z-30 hidden max-w-full select-none items-center gap-1 px-3 md:flex {shellSlots.where
    ? 'right-0'
    : 'w-60'} {isDesktop ? 'h-9 pl-[78px]' : 'mt-3 px-4'}"
>
  {#each NAV_TABS as tab (tab.href)}
    {@const active = isActive(page.url.pathname, tab.href)}
    <Tooltip label={tab.label} hotkey={tab.key}>
      <a
        href={tab.href}
        aria-current={active ? "page" : undefined}
        aria-busy={tab.syncing()}
        aria-label={tab.label}
        class="press-sm relative flex size-[22px] items-center justify-center rounded-md {active
          ? 'bg-surface-alt text-fg'
          : 'hoverable text-fg-muted'}"
      >
        <tab.icon size={14} />
        <!-- A screen whose rows are being checked wears a dot, in the corner rather than the row:
             the strip has no room to grow and nothing beside it should shift. -->
        {#if tab.syncing()}
          <span class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-fg-faint"></span>
        {/if}
      </a>
    </Tooltip>
  {/each}

  <Tooltip label="Search" hotkey="⌘K">
    <button
      type="button"
      aria-label="Search"
      onclick={() => palette.show()}
      class="press-sm hoverable flex size-[22px] items-center justify-center rounded-md text-fg-muted"
    >
      <Search size={14} />
    </button>
  </Tooltip>

  {#if shellSlots.where}
    <div class="ml-1 flex min-w-0 items-center">{@render shellSlots.where()}</div>
  {/if}

  <div data-tauri-drag-region={isDesktop ? true : undefined} class="flex-1"></div>

  <AccountPill compact />
</div>
