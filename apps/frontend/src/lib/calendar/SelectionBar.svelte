<script lang="ts">
  import IconButton from "$lib/components/IconButton.svelte";
  import type { Category } from "$lib/types";
  import { X } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";
  import CategoryPicker from "./CategoryPicker.svelte";

  /**
   * What can be done to the blocks a box gathered. It floats over the grid rather than opening
   * beside any one of them: the batch belongs to no single block, and the grid underneath has to
   * stay visible while the box is still being adjusted.
   */
  let { categories }: { categories: readonly Category[] } = $props();

  const data = calendarData;
  const plannable = $derived(categories.filter((c) => !c.isBuffer && !c.archived));
  const count = $derived(data.picked.size);

  let pickerRect = $state<DOMRect | null>(null);

  function apply(categoryId: string) {
    pickerRect = null;
    void data.mapEvents(data.pickedEvents, [{ categoryId, weightPercent: 100 }]);
    data.clearPicked();
  }
</script>

{#if count > 0}
  <div
    class="float-in fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border
      border-line bg-surface py-1.5 pr-1.5 pl-4 shadow-(--shadow-float)"
  >
    <span class="t-label whitespace-nowrap text-fg-muted">{count} selected</span>
    <button
      type="button"
      onclick={(e) => (pickerRect = e.currentTarget.getBoundingClientRect())}
      class="t-label press-sm rounded-full bg-surface-alt px-3 py-1.5 whitespace-nowrap"
    >
      Set category
    </button>
    <IconButton label="Clear selection" tone="plain" onclick={() => data.clearPicked()}>
      <X size={16} class="text-fg-muted" />
    </IconButton>
  </div>
{/if}

{#if pickerRect}
  <CategoryPicker
    rect={pickerRect}
    categories={plannable}
    onchoose={apply}
    onclose={() => (pickerRect = null)}
  />
{/if}
