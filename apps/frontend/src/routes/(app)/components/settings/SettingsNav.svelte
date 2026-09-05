<script lang="ts">
  import { Field } from "$lib/components";
  import { matchingPanes, type Pane } from "$lib/settings";
  import { Search } from "lucide-svelte";
  import { tick } from "svelte";

  /**
   * The rail down the left of the settings panel: a search box, and the sections in the order
   * they lie on the page. The page is one scroll; the rail is the way to a part of it quickly,
   * and it lights the section that is in view so the two never disagree.
   *
   * The box is focused the moment the panel opens, so ⌘, then a word is the whole journey to a
   * setting. Typing narrows the rail to the sections that mention the word and scrolls to the
   * first of them.
   */
  let {
    active,
    query = $bindable(""),
    onselect,
  }: { active: Pane; query: string; onselect: (pane: Pane) => void } = $props();

  let input = $state<HTMLInputElement | null>(null);

  const panes = $derived(matchingPanes(query));

  // After the dialog has moved focus onto its own panel, which it does in the same flush.
  $effect(() => void tick().then(() => input?.focus()));

  // The first section that matches is where a typed word leads, as it is typed.
  $effect(() => {
    if (query.trim() && panes.length > 0 && !panes.some((pane) => pane.value === active)) onselect(panes[0].value);
  });
</script>

<nav class="flex flex-col gap-0.5 px-2 pt-3 pb-4" aria-label="Settings">
  <div class="relative mb-2">
    <Search size={14} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-faint" />
    <Field bind:value={query} bind:element={input} placeholder="Find a setting" ariaLabel="Find a setting" class="h-8! pl-8!" />
  </div>

  {#each panes as pane (pane.value)}
    {@const current = active === pane.value}
    <button
      type="button"
      aria-current={current ? "location" : undefined}
      onclick={() => onselect(pane.value)}
      class="press-sm flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left
        {current ? 'bg-surface text-fg' : 'text-fg-muted hover:bg-surface/60'}"
    >
      <pane.icon size={16} class="shrink-0 {current ? 'text-fg' : 'text-fg-faint'}" />
      <span class="t-label truncate">{pane.label}</span>
    </button>
  {:else}
    <p class="t-micro px-2 py-1.5 text-fg-faint">Nothing matches.</p>
  {/each}
</nav>
