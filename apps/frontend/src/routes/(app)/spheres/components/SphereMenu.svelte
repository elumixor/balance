<script lang="ts">
  import { AnchoredPopup, Field, PopoverItem } from "$lib/components";
  import { readLink } from "$lib/planning/sphere-tree";
  import { Link, Scissors, Trash2 } from "lucide-svelte";

  /**
   * What can be done to a sphere as a whole — cut it in two, make it part of another, link the Keep
   * page its work lives on, or remove it — opened wherever it was asked for: a slice of the ring, a
   * sphere's heading or a part's row. The buffer can only be cut, and a part can't be.
   */
  let {
    at,
    onsplit,
    onremove,
    parentId = null,
    options = [],
    onparent,
    urn = null,
    onurn,
    onclose,
  }: {
    at: DOMRect;
    onsplit?: () => void;
    onremove?: () => void;
    /** The sphere this one is part of now. */
    parentId?: string | null;
    /** What it may be made a part of — see `parentOptions`. */
    options?: { id: string; name: string }[];
    onparent?: (parentId: string | null) => void;
    urn?: string | null;
    onurn?: (urn: string | null) => void;
    onclose: () => void;
  } = $props();

  let editingLink = $state(false);
  let typed = $state("");
  let invalid = $state(false);

  function act(fn: () => void) {
    fn();
    onclose();
  }

  function saveLink() {
    const read = readLink(typed);
    if (!read) {
      invalid = true;
      return;
    }
    act(() => onurn?.(read.urn));
  }
</script>

<AnchoredPopup rect={at} width={220} {onclose}>
  {#if editingLink}
    <div class="space-y-1.5 p-2">
      <Field
        bind:value={typed}
        autofocus
        placeholder="https://keep.desk.atmagaming.com/p/…"
        ariaLabel="Keep link"
        oninput={() => (invalid = false)}
        onkeydown={(e) => {
          if (e.key === "Enter") saveLink();
          if (e.key === "Escape") {
            e.stopPropagation();
            editingLink = false;
          }
        }}
      />
      <p class="t-micro {invalid ? 'text-danger' : 'text-fg-faint'}">
        {invalid ? "That isn't a link." : "Enter to save, empty to remove."}
      </p>
    </div>
  {:else}
    <div role="menu" tabindex="-1" class="py-1">
      {#if onsplit}
        <PopoverItem label="Split" onclick={() => act(() => onsplit?.())}>
          {#snippet icon()}<Scissors size={15} class="text-fg-muted" />{/snippet}
        </PopoverItem>
      {/if}
      {#if onurn}
        <PopoverItem
          label={urn ? "Change Keep link…" : "Keep link…"}
          onclick={() => {
            typed = urn ?? "";
            editingLink = true;
          }}
        >
          {#snippet icon()}<Link size={15} class="text-fg-muted" />{/snippet}
        </PopoverItem>
      {/if}
      {#if onparent && (options.length > 0 || parentId)}
        <p class="t-micro px-3 pt-2 pb-1 text-fg-faint">Part of</p>
        <PopoverItem label="Nothing" selected={parentId === null} onclick={() => act(() => onparent?.(null))} />
        {#each options as option (option.id)}
          <PopoverItem
            label={option.name || "Untitled"}
            selected={parentId === option.id}
            onclick={() => act(() => onparent?.(option.id))}
          />
        {/each}
      {/if}
      {#if onremove}
        <PopoverItem label="Remove" tone="danger" onclick={() => act(() => onremove?.())}>
          {#snippet icon()}<Trash2 size={15} />{/snippet}
        </PopoverItem>
      {/if}
    </div>
  {/if}
</AnchoredPopup>
