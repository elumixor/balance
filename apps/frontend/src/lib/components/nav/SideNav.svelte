<script lang="ts">
  import { page } from "$app/state";
  import AccountButton from "$lib/components/AccountButton.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { isActive, NAV_TABS } from "$lib/nav";
  import { sidePanel } from "./side-panel.svelte";

  /**
   * The wide-screen rail. Everything that isn't the current screen's own controls fits on one
   * line: where you are on the left, who you are on the right, and the screen's section under
   * both. Two destinations don't need a read-down list with their names spelled out — the icons
   * are the whole vocabulary, and hovering one says the name and the key that gets there.
   *
   * On macOS the window has no title bar of its own, so the close/minimise/zoom buttons land on
   * that same line, and the strip is indented past them. In a browser the indent goes away and the
   * icons start at the edge.
   */
</script>

<!-- `select-none`: none of this is text anyone means to copy, and a drag across it should move the
     window rather than paint a selection over it. -->
<nav
  class="hidden h-full w-60 shrink-0 select-none flex-col overflow-hidden bg-surface px-3 pb-6 md:flex {isDesktop
    ? 'pt-0'
    : 'pt-3'}"
>
  <!-- On macOS `h-9` is the title bar's height, which is what puts these on the window buttons'
       own line. `data-tauri-drag-region` makes the strip behave like the title bar it covers —
       the attribute is read off the event target, so every button on it stays a button, and the
       spacer carries it too or the widest part of the strip wouldn't drag. -->
  <div
    data-tauri-drag-region={isDesktop ? true : undefined}
    class="mb-4 flex items-center gap-1 {isDesktop ? 'h-9 pl-[78px]' : 'px-1'}"
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

    <div data-tauri-drag-region={isDesktop ? true : undefined} class="flex-1"></div>

    <ThemeToggle compact />
    <AccountButton compact />
  </div>

  <!-- The one part of the rail that scrolls. The strip is the rail's fixed point — scrolling it
       away would take the window buttons' backdrop with it — so the overflow lives here, on the
       screen's own section, and clips to whatever room is left. -->
  {#if sidePanel.section}
    <div class="min-h-0 flex-1 overflow-y-auto border-t border-line pt-4">
      {@render sidePanel.section()}
    </div>
  {/if}
</nav>
