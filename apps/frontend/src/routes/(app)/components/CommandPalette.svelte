<script lang="ts">
  import { Avatar, Spinner } from "$lib/components";
  import { peopleDirectory } from "$lib/people/directory.svelte";
  import { viewport } from "$lib/platform/viewport.svelte";
  import { groupItems, KIND_LABELS, palette, type SearchItem, type SearchKind } from "$lib/search";
  import { focusWhenReady } from "$lib/ui/focus";
  import { CalendarDays, LayoutGrid, Search, Settings2 } from "lucide-svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  /**
   * The ⌘K box: one field over a dimmed page, and under it everything the word finds, grouped by
   * what it is. Arrow keys walk the rows, Enter goes, Escape leaves. The rows are `palette.items`;
   * this draws them and nothing more.
   */
  const ICONS: Record<Exclude<SearchKind, "person">, typeof Search> = {
    screen: LayoutGrid,
    setting: Settings2,
    event: CalendarDays,
  };

  let list = $state<HTMLElement>();
  let highlighted = $state(0);

  const groups = $derived(groupItems(palette.items));
  /** The rows in the order they are drawn, which is the order the arrow keys walk. */
  const flat = $derived(groups.flatMap((group) => group.items));

  // A fresh list starts at the top; what was highlighted in the last one means nothing in this.
  $effect(() => {
    flat;
    highlighted = 0;
  });

  $effect(() => {
    if (!palette.open) return;
    list?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      return palette.hide();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      highlighted = (highlighted + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[highlighted];
      if (item) palette.choose(item);
    }
  }

  function personOf(item: SearchItem) {
    return peopleDirectory.byId(item.id.slice("person:".length));
  }
</script>

{#if palette.open}
  <!-- The same ground as a dialog: a dimmed page, a panel high on it, a sheet on a phone. -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-overlay-strong backdrop-blur-sm backdrop-saturate-50
      sm:items-start sm:p-4 sm:pt-[12vh]"
    transition:fade={{ duration: 120 }}
    onclick={() => palette.hide()}
    role="presentation"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      tabindex="-1"
      transition:fly={{ duration: 220, y: viewport.sm ? -8 : 400, easing: cubicOut }}
      onclick={(e) => e.stopPropagation()}
      {onkeydown}
      class="flex max-h-[calc(100dvh-var(--safe-top)-24px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl
        border border-line bg-surface shadow-float max-sm:safe-bottom sm:max-h-[60vh] sm:rounded-lg"
    >
      <div class="sheet-handle sm:hidden"></div>
      <div class="flex items-center gap-2 border-b border-line px-4 py-3">
        <Search size={16} class="shrink-0 text-fg-faint" />
        <input
          use:focusWhenReady
          value={palette.query}
          oninput={(e) => palette.typed(e.currentTarget.value)}
          placeholder="Search events, people, settings…"
          aria-label="Search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="t-body min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-faint"
        />
        {#if palette.searching}<Spinner size={14} />{/if}
        <kbd class="t-micro hidden rounded-sm border border-line bg-surface-alt px-1 text-fg-muted sm:block">esc</kbd>
      </div>

      <div bind:this={list} class="min-h-0 flex-1 overflow-y-auto p-1">
        {#each groups as group (group.kind)}
          <p class="t-micro px-3 pt-2 pb-1 text-fg-faint">{KIND_LABELS[group.kind]}</p>
          {#each group.items as item (item.id)}
            {@const index = flat.indexOf(item)}
            {@const person = item.kind === "person" ? personOf(item) : null}
            <button
              type="button"
              data-index={index}
              onclick={() => palette.choose(item)}
              onpointermove={() => (highlighted = index)}
              class="menu-row {index === highlighted ? 'bg-surface-alt' : ''}"
            >
              {#if person}
                <Avatar {person} size={18} />
              {:else if item.kind !== "person"}
                {@const Icon = ICONS[item.kind]}
                <span class="flex size-[18px] shrink-0 items-center justify-center text-fg-faint"><Icon size={14} /></span>
              {/if}
              <span class="min-w-0 flex-1 truncate">{item.label}</span>
              {#if item.hint}<span class="t-micro shrink-0 truncate text-fg-muted">{item.hint}</span>{/if}
            </button>
          {/each}
        {:else}
          <p class="t-micro px-3 py-6 text-center text-fg-faint">
            {palette.query.trim() ? "Nothing matches." : "Type to find an event, a person or a setting."}
          </p>
        {/each}
      </div>
    </div>
  </div>
{/if}
