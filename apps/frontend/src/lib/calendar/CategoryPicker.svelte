<script lang="ts">
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import AnchoredPopup from "$lib/components/AnchoredPopup.svelte";
  import type { Category } from "$lib/types";

  /**
   * A category, chosen by typing. The whole picker is one thing whether it's answering for the
   * block you pressed or for every block you gathered, so both open the same list in the same
   * place — beside whatever was pressed.
   */
  let {
    rect,
    categories,
    value = "",
    onchoose,
    onclose,
  }: {
    rect: DOMRect | null;
    categories: readonly Category[];
    value?: string;
    onchoose: (categoryId: string) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let list = $state<HTMLElement>();

  /** A name matches on any word it starts with, so "deep" finds "Deep work" and "Go deep" alike. */
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)));
  });

  /**
   * The highlight follows the filter rather than the pointer: whatever narrowing you just typed,
   * the first row is the one Enter takes, and the current category is where an unfiltered list
   * opens.
   */
  let active = $state(0);
  $effect(() => {
    query;
    active = query.trim() ? 0 : Math.max(0, matches.findIndex((c) => c.id === value));
  });

  // Arrow keys can walk past the fold of a long list, so the row they land on is scrolled to.
  $effect(() => {
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  });

  function move(delta: number) {
    if (matches.length === 0) return;
    active = (active + delta + matches.length) % matches.length;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Enter" && matches[active]) onchoose(matches[active].id);
    else return;
    e.preventDefault();
  }

  /** The list is all there is to this popup — typing is the only thing you opened it to do. */
  function autofocus(node: HTMLInputElement) {
    node.focus();
  }
</script>

<AnchoredPopup {rect} width={240} {onclose}>
  <div class="flex flex-col gap-1.5 p-1.5">
    <input
      use:autofocus
      bind:value={query}
      {onkeydown}
      placeholder="Search categories"
      spellcheck="false"
      autocomplete="off"
      aria-label="Search categories"
      class="t-body h-9 w-full shrink-0 rounded-md border border-line bg-surface px-2.5
        transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-line-strong
        focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
    />

    <div bind:this={list} class="max-h-60 overflow-y-auto">
      {#each matches as c, i (c.id)}
        <button
          type="button"
          onclick={() => onchoose(c.id)}
          onpointermove={() => (active = i)}
          aria-pressed={c.id === value}
          class="t-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left
            {i === active ? 'bg-surface-alt' : ''}"
        >
          <CategoryIcon icon={c.icon} color={c.color} size={22} />
          <span class="flex-1 truncate {c.id === value ? 'text-fg' : 'text-fg-muted'}">{c.name}</span>
        </button>
      {/each}

      {#if matches.length === 0}
        <p class="t-micro py-6 text-center text-fg-faint">No category by that name.</p>
      {/if}
    </div>
  </div>
</AnchoredPopup>
