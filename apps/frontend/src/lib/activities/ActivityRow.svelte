<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
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

<div class="space-y-2 py-3" data-testid="activity-row">
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
    <Button variant="bare" class="size-8 bg-surface-alt" title="Archive {draft.name || 'this activity'}" onclick={onarchive}>
      {#snippet icon()}<Archive size={15} class="text-fg-muted" />{/snippet}
    </Button>
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
