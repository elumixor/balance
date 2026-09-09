<script lang="ts" module>
  /**
   * A row in the list. A sphere carries its own icon; a project or a practice is a dot or a
   * repeat glyph in its sphere's colour.
   */
  export interface PickerItem {
    key: string;
    name: string;
    color: string;
    icon?: string;
    practice?: boolean;
  }
</script>

<script lang="ts">
  import { focusWhenReady } from "$lib/ui/focus";
  import AnchoredPopup from "./AnchoredPopup.svelte";
  import CategoryIcon from "./CategoryIcon.svelte";
  import Dot from "./Dot.svelte";
  import { Plus, Repeat, Trash2 } from "lucide-svelte";

  /**
   * One thing chosen by typing — a sphere, a project, a practice. The list is the same wherever
   * it opens, so what a block counts as and what it was for are picked the same way, beside
   * whatever was pressed. Clearing lives in the field rather than beside the thing it clears: a
   * cross on a label is a press away from a change nobody meant.
   */
  let {
    rect,
    width = 240,
    items,
    value = "",
    placeholder,
    ariaLabel,
    onchoose,
    onclose,
    /** Given when the choice can be taken back — the trash inside the field. */
    onclear,
    /** Given when a name nothing answers to can be made into something, rather than sending anyone away. */
    oncreate,
    createLabel,
  }: {
    rect: DOMRect | null;
    width?: number;
    items: readonly PickerItem[];
    value?: string;
    placeholder: string;
    ariaLabel: string;
    onchoose: (key: string) => void;
    onclose: () => void;
    onclear?: () => void;
    oncreate?: (name: string) => void;
    createLabel?: (name: string) => string;
  } = $props();

  let query = $state("");
  let list = $state<HTMLElement>();

  const ROW_ICON = 22;
  const FIELD_ICON = 14;
  const GLYPH = 12;

  /** A name matches on any word it starts with, so "deep" finds "Deep work" and "Go deep" alike. */
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)));
  });

  /** A name nothing answers to, when this picker can make one. */
  const newName = $derived.by(() => {
    const q = query.trim();
    if (!q || !oncreate) return null;
    return items.some((item) => item.name.toLowerCase() === q.toLowerCase()) ? null : q;
  });

  const options = $derived(newName ? matches.length + 1 : matches.length);

  /**
   * The highlight follows the filter rather than the pointer: whatever narrowing you just typed,
   * the first row is the one Enter takes, and the current choice is where an unfiltered list opens.
   */
  let active = $state(0);
  $effect(() => {
    query;
    active = query.trim() ? 0 : Math.max(0, matches.findIndex((item) => item.key === value));
  });

  // Arrow keys can walk past the fold of a long list, so the row they land on is scrolled to.
  $effect(() => {
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  });

  function move(delta: number) {
    if (options === 0) return;
    active = (active + delta + options) % options;
  }

  function pick(index: number) {
    const item = matches[index];
    if (item) onchoose(item.key);
    else if (newName) oncreate?.(newName);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Enter" && active < options) pick(active);
    else return;
    e.preventDefault();
  }
</script>

<AnchoredPopup {rect} {width} {onclose}>
  <div class="flex flex-col gap-1.5 p-1.5">
    <div class="relative shrink-0">
      <input
        use:focusWhenReady
        bind:value={query}
        {onkeydown}
        {placeholder}
        spellcheck="false"
        autocomplete="off"
        aria-label={ariaLabel}
        class="field-boxed w-full {onclear && value ? 'pr-8' : ''}"
      />
      {#if onclear && value}
        <button
          type="button"
          aria-label="Clear"
          onclick={onclear}
          class="press-sm absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-fg-faint hover:text-danger"
        >
          <Trash2 size={FIELD_ICON} />
        </button>
      {/if}
    </div>

    <div bind:this={list} class="max-h-60 overflow-y-auto">
      {#each matches as item, i (item.key)}
        <button
          type="button"
          onclick={() => onchoose(item.key)}
          onpointermove={() => (active = i)}
          aria-pressed={item.key === value}
          class="menu-row {i === active ? 'bg-surface-alt' : ''}"
        >
          {#if item.icon}
            <CategoryIcon icon={item.icon} color={item.color} size={ROW_ICON} />
          {:else if item.practice}
            <Repeat size={GLYPH} style="color:{item.color}" />
          {:else}
            <span class="flex w-3 justify-center"><Dot color={item.color} /></span>
          {/if}
          <span class="flex-1 truncate" style="color:{item.color}">{item.name}</span>
        </button>
      {/each}

      {#if newName}
        <button
          type="button"
          onclick={() => oncreate?.(newName)}
          onpointermove={() => (active = matches.length)}
          class="menu-row {active === matches.length ? 'bg-surface-alt' : ''}"
        >
          <span class="flex w-3 justify-center"><Plus size={GLYPH} /></span>
          <span class="flex-1 truncate text-fg-muted">{createLabel?.(newName) ?? newName}</span>
        </button>
      {:else if matches.length === 0}
        <p class="t-micro py-6 text-center text-fg-faint">Nothing by that name.</p>
      {/if}
    </div>
  </div>
</AnchoredPopup>
