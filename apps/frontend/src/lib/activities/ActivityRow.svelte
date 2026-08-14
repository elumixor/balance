<script lang="ts">
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import type { Category } from "$lib/types";
  import { Archive } from "lucide-svelte";
  import ActivitySplitBar from "./ActivitySplitBar.svelte";
  import type { ActivityDraft, Piece } from "./activities-data.svelte";

  /** One row in the Activities list: name and split, both live and always editable — no expanding. */
  let {
    draft,
    categoryById,
    plannedCategories,
    focus,
    onupdate,
    onfocused,
    onarchive,
  }: {
    draft: ActivityDraft;
    categoryById: Map<string, Category>;
    plannedCategories: readonly Category[];
    focus: boolean;
    onupdate: (patch: { name?: string; pieces?: Piece[] }) => void;
    onfocused: () => void;
    onarchive: () => void;
  } = $props();

  let nameInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!focus || !nameInput) return;
    nameInput.focus();
    nameInput.select();
    onfocused();
  });
</script>

<div class="space-y-2 py-3">
  <div class="flex items-center gap-2">
    <Field
      value={draft.name}
      oninput={(name) => onupdate({ name })}
      bind:element={nameInput}
      variant="inline"
      placeholder="Activity name"
      autocapitalize="sentences"
      class="t-body-strong flex-1"
    />
    <IconButton label="Archive {draft.name || 'this activity'}" onclick={onarchive}>
      <Archive size={15} class="text-fg-muted" />
    </IconButton>
  </div>

  {#if plannedCategories.length === 0}
    <p class="t-label text-fg-muted">Plan at least one category on the Week tab first.</p>
  {:else}
    <ActivitySplitBar
      pieces={draft.pieces}
      categories={plannedCategories}
      {categoryById}
      onchange={(pieces) => onupdate({ pieces })}
    />
  {/if}
</div>
