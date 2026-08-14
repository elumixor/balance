<script lang="ts">
  import Field from "$lib/components/Field.svelte";
  import LabelledField from "$lib/components/LabelledField.svelte";
  import type { Category } from "$lib/types";
  import ActivitySplitBar from "./ActivitySplitBar.svelte";
  import type { ActivityDraft, Piece } from "./activities-data.svelte";

  /**
   * Name and split, open on a row. Nothing here saves — every change lands on the draft the
   * moment it's made, and the screen's own autosave decides when that's worth a write.
   */
  let {
    draft,
    categories,
    categoryById,
    focus = false,
    onupdate,
    onfocused,
  }: {
    draft: ActivityDraft;
    categories: readonly Category[];
    categoryById: Map<string, Category>;
    /** True for the one row that should grab the name field and select it, once. */
    focus?: boolean;
    onupdate: (patch: { name?: string; pieces?: Piece[] }) => void;
    onfocused: () => void;
  } = $props();

  let nameInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!focus || !nameInput) return;
    nameInput.focus();
    nameInput.select();
    onfocused();
  });
</script>

<div class="space-y-4 py-3">
  <LabelledField label="Name">
    <Field
      value={draft.name}
      oninput={(name) => onupdate({ name })}
      bind:element={nameInput}
      placeholder="Activity name"
      autocapitalize="sentences"
    />
  </LabelledField>

  {#if categories.length === 0}
    <p class="t-label text-fg-muted">Plan at least one category on the Week tab first.</p>
  {:else}
    <ActivitySplitBar pieces={draft.pieces} {categories} {categoryById} onchange={(pieces) => onupdate({ pieces })} />
  {/if}
</div>
