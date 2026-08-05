<script lang="ts">
  import { restColor } from "$lib/colors";
  import Divider from "$lib/components/Divider.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import SplitBar from "$lib/components/SplitBar.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import { activitySplits } from "$lib/splits";
  import type { Activity, Category } from "$lib/types";
  import { Archive } from "lucide-svelte";
  import type { ActivityDraft } from "./activities-data.svelte";
  import ActivityEditor from "./ActivityEditor.svelte";

  /** One row in the Activities list: summary + split bar, expanding into the full editor. */
  let {
    activity,
    index,
    categoryById,
    plannedCategories,
    expanded,
    ontoggle,
    oncancel,
    onsave,
    onarchive,
  }: {
    activity: Activity;
    index: number;
    categoryById: Map<string, Category>;
    plannedCategories: Category[];
    expanded: boolean;
    ontoggle: () => void;
    oncancel: () => void;
    onsave: (draft: ActivityDraft) => Promise<void>;
    onarchive: () => void;
  } = $props();
</script>

<div class="list-item-in" style="animation-delay:{Math.min(index, 8) * 35}ms">
  {#if index > 0}<Divider />{/if}
  <div class="flex items-center gap-3">
    <button
      type="button"
      onclick={ontoggle}
      aria-expanded={expanded}
      aria-label="Edit {activity.name}"
      class="flex flex-1 items-center gap-3 py-3 text-left"
    >
      <SplitBar splits={activitySplits(activity, categoryById)} vertical thickness={3} class="min-h-9 self-stretch" />
      <span class="flex-1 space-y-1.5">
        <span class="t-body-strong block truncate">{activity.name}</span>
        <span class="flex flex-wrap gap-1.5">
          {#if activity.weights.length === 0}
            <span class="t-micro text-fg-faint">Unassigned</span>
          {:else}
            {#each activity.weights as weight (weight.categoryId)}
              {@const category = categoryById.get(weight.categoryId)}
              <Tag
                label="{category?.isBuffer ? 'Free time' : (category?.name ?? 'Unknown')} {weight.weightPercent}%"
                color={category?.isBuffer ? restColor : (category?.color ?? restColor)}
              />
            {/each}
          {/if}
        </span>
      </span>
    </button>
    {#if expanded}
      <IconButton label="Archive {activity.name}" onclick={onarchive}>
        <Archive size={15} class="text-fg-muted" />
      </IconButton>
    {/if}
  </div>

  {#if expanded}
    <Panel class="mb-3">
      <ActivityEditor {activity} categories={plannedCategories} {oncancel} {onsave} />
    </Panel>
  {/if}
</div>
