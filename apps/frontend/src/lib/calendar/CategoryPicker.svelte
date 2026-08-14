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
    onchoose,
    onclose,
  }: {
    rect: DOMRect | null;
    categories: readonly Category[];
    value?: string;
    onchoose: (categoryId: string) => void;
    onclose: () => void;
  } = $props();

  function choose(id: string) {
    if (categories.some((c) => c.id === id)) onchoose(id);
  }
</script>

<AnchoredPopup {rect} width={220} {onclose}>
  <div class="p-1.5">
    <Combobox.Root type="single" {value} onValueChange={choose} open={true}>
      <Combobox.ContentStatic onInteractOutside={() => {}} onEscapeKeydown={() => {}} class="max-h-60 overflow-y-auto">
        {#each categories as c (c.id)}
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
      </Combobox.ContentStatic>
    </Combobox.Root>
  </div>
</AnchoredPopup>
