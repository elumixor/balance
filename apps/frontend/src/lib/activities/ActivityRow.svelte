<script lang="ts">
  import { restColor } from "$lib/colors";
  import IconButton from "$lib/components/IconButton.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import SplitBar from "$lib/components/SplitBar.svelte";
  import type { Category, Split } from "$lib/types";
  import { Archive } from "lucide-svelte";
  import type { ActivityDraft, Piece } from "./activities-data.svelte";
  import ActivityEditor from "./ActivityEditor.svelte";

  /** One row in the Activities list: summary + split bar, expanding into the full editor. */
  let {
    draft,
    categoryById,
    plannedCategories,
    expanded,
    focus,
    ontoggle,
    onupdate,
    onfocused,
    onarchive,
  }: {
    draft: ActivityDraft;
    categoryById: Map<string, Category>;
    plannedCategories: readonly Category[];
    expanded: boolean;
    focus: boolean;
    ontoggle: () => void;
    onupdate: (patch: { name?: string; pieces?: Piece[] }) => void;
    onfocused: () => void;
    onarchive: () => void;
  } = $props();

  const claimed = $derived(draft.pieces.reduce((sum, p) => sum + p.percent, 0));

  const previewSplits = $derived<Split[]>([
    ...draft.pieces
      .filter((p) => p.percent > 0)
      .map((p) => {
        const category = categoryById.get(p.categoryId);
        return { id: p.key, color: category?.isBuffer ? restColor : (category?.color ?? restColor), value: p.percent };
      }),
    ...(claimed < 100 ? [{ id: "__free__", color: restColor, value: 100 - claimed }] : []),
  ]);
</script>

<div class="flex items-center gap-3">
  <button
    type="button"
    onclick={ontoggle}
    aria-expanded={expanded}
    aria-label="Edit {draft.name || 'Untitled activity'}"
    class="hoverable -mx-2 flex flex-1 items-center gap-3 rounded-md px-2 py-3 text-left"
  >
    <SplitBar splits={previewSplits} vertical thickness={3} class="min-h-9 self-stretch" />
    <span class="flex-1 space-y-1.5">
      <span class="t-body-strong block truncate">{draft.name || "Untitled activity"}</span>
      <span class="t-micro block text-fg-faint">
        {#if draft.pieces.length === 0}
          Unassigned
        {:else}
          {draft.pieces
            .filter((p) => p.percent > 0)
            .map((p) => `${categoryById.get(p.categoryId)?.name ?? "Unknown"} ${p.percent}%`)
            .join(" · ")}
        {/if}
      </span>
    </span>
  </button>
  {#if expanded}
    <IconButton label="Archive {draft.name || 'this activity'}" onclick={onarchive}>
      <Archive size={15} class="text-fg-muted" />
    </IconButton>
  {/if}
</div>

{#if expanded}
  <Panel class="mb-3">
    <ActivityEditor {draft} categories={plannedCategories} {categoryById} {focus} {onupdate} {onfocused} />
  </Panel>
{/if}
