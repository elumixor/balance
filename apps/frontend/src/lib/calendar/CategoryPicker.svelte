<script lang="ts">
  import AnchoredPopup from "$lib/components/AnchoredPopup.svelte";
  import type { Category } from "$lib/types";
  import { Combobox } from "bits-ui";

  /**
   * A category, chosen by typing. The whole picker is one thing whether it's answering for the
   * block you pressed or for every block you gathered, so both open the same list in the same
   * place — beside whatever was pressed.
   */
  let {
    rect,
    categories,
    value = "",
    label = "Category",
    onchoose,
    onclose,
  }: {
    rect: DOMRect | null;
    categories: readonly Category[];
    value?: string;
    label?: string;
    onchoose: (categoryId: string) => void;
    onclose: () => void;
  } = $props();

  let search = $state("");
  const matches = $derived(categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())));

  function choose(id: string) {
    if (categories.some((c) => c.id === id)) onchoose(id);
  }
</script>

<AnchoredPopup {rect} width={220} {onclose}>
  <div class="p-1.5">
    <Combobox.Root type="single" {value} onValueChange={choose} open={true}>
      <Combobox.Input
        oninput={(e) => (search = e.currentTarget.value)}
        placeholder={label}
        aria-label="Search categories"
        class="t-body h-9 w-full rounded-md border border-transparent bg-transparent px-2 transition-colors
          hover:border-line focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
      />
      <Combobox.ContentStatic onInteractOutside={() => {}} onEscapeKeydown={() => {}} class="mt-1 max-h-60 overflow-y-auto">
        {#each matches as c (c.id)}
          <Combobox.Item value={c.id} label={c.name}>
            {#snippet children({ selected })}
              <div
                class="flex items-center gap-2 rounded-md px-2 py-2 t-body hover:bg-surface-alt
                  {selected ? 'bg-surface-alt' : ''}"
              >
                <span class="size-2.5 shrink-0 rounded-full" style="background:{c.color}"></span>
                <span class="flex-1 truncate">{c.name}</span>
              </div>
            {/snippet}
          </Combobox.Item>
        {/each}
        {#if !matches.length}
          <p class="t-micro px-2 py-2 text-fg-faint">No matches</p>
        {/if}
      </Combobox.ContentStatic>
    </Combobox.Root>
  </div>
</AnchoredPopup>
