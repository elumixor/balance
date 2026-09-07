<script lang="ts">
  import { AddressField, CardRow } from "$lib/components";
  import { MapPinCheck, X } from "lucide-svelte";

  /**
   * Where it leaves you. Most events leave you where you were, so the row recedes until it is
   * set; a flight, a move, the drive to the cabin say where they end, and every journey after
   * starts from there until the next one that says so (`$lib/travel/whereabouts.ts`).
   *
   * It is a mapping of the app's own rather than a field of the invitation, so it works on an
   * event you can't otherwise change, and the row is never disabled.
   */
  let {
    endLocation,
    onchange,
  }: {
    endLocation: string | null;
    onchange: (endLocation: string | null) => void;
  } = $props();

  let editing = $state(false);
  let draft = $state("");

  function begin() {
    draft = endLocation ?? "";
    editing = true;
  }

  function commit(value: string) {
    editing = false;
    const next = value.trim() || null;
    if (next !== endLocation) onchange(next);
  }
</script>

{#if editing}
  <CardRow icon={MapPinCheck}>
    <div class="min-w-0 flex-1">
      <AddressField
        bind:value={draft}
        ariaLabel="Where it leaves you"
        placeholder="Where it leaves you"
        autofocus
        variant="bare"
        onpick={(suggestion) => commit(suggestion.address)}
        oncommit={commit}
      />
    </div>
  </CardRow>
{:else if endLocation}
  <CardRow icon={MapPinCheck} set align="start">
    <div class="flex min-w-0 flex-1 items-start gap-1 py-1">
      <button type="button" onclick={begin} class="t-label min-w-0 flex-1 break-words text-left hover:text-fg">
        <span class="text-fg-muted">Ends at</span> {endLocation}
      </button>
      <button
        type="button"
        aria-label="Remove end place"
        onclick={() => onchange(null)}
        class="press-sm hoverable shrink-0 rounded-md p-1 text-fg-faint hover:text-fg"
      >
        <X size={14} />
      </button>
    </div>
  </CardRow>
{:else}
  <CardRow icon={MapPinCheck} label="Ends elsewhere" onclick={begin} />
{/if}
