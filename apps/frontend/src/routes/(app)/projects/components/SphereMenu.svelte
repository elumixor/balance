<script lang="ts">
  import { AnchoredPopup, PopoverItem } from "$lib/components";
  import { Scissors, Trash2 } from "lucide-svelte";

  /**
   * What can be done to a sphere as a whole — cut it in two, or remove it — opened wherever it
   * was asked for: a slice of the ring, or the sphere's own heading. The buffer can only be cut.
   */
  let {
    at,
    onsplit,
    onremove,
    onclose,
  }: { at: DOMRect; onsplit: () => void; onremove?: () => void; onclose: () => void } = $props();
</script>

<AnchoredPopup rect={at} width={180} {onclose}>
  <div role="menu" tabindex="-1" class="py-1">
    <PopoverItem
      label="Split"
      onclick={() => {
        onsplit();
        onclose();
      }}
    >
      {#snippet icon()}<Scissors size={15} class="text-fg-muted" />{/snippet}
    </PopoverItem>
    {#if onremove}
      <PopoverItem
        label="Remove"
        tone="danger"
        onclick={() => {
          onremove();
          onclose();
        }}
      >
        {#snippet icon()}<Trash2 size={15} />{/snippet}
      </PopoverItem>
    {/if}
  </div>
</AnchoredPopup>
