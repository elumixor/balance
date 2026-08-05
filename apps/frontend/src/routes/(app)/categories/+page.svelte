<script lang="ts">
  import { restColor } from "$lib/colors";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import WeekRing from "$lib/components/ring/WeekRing.svelte";
  import ScreenTitle from "$lib/components/ScreenTitle.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import { AUTOSAVE_DELAY_MS, CategoryDrafts, WEEK_HOURS } from "$lib/week/category-drafts.svelte";
  import CategoryDraftRow from "$lib/week/CategoryDraftRow.svelte";
  import { Check, Plus } from "lucide-svelte";

  const data = new CategoryDrafts();
  void data.load();

  // Changes save themselves a moment after you stop moving things.
  $effect(() => {
    if (!data.savable) return;
    const timeout = setTimeout(() => void data.flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  });
</script>

<div class="safe-top px-5 pt-4 pb-10">
  <ScreenTitle title="Week" subtitle="168 hours. Decide where they go before they go.">
    {#snippet trailing()}
      <AccountMenu />
    {/snippet}
  </ScreenTitle>

  {#if data.loadError && !data.categories}
    <LoadError message={data.loadError} onretry={data.load} />
  {:else if !data.categories}
    <div class="mt-4 flex flex-col items-center gap-4">
      <Skeleton width={232} height={232} radius={116} />
      <Skeleton width="80%" height={16} />
    </div>
  {:else}
    <div class="mt-2 flex justify-center">
      <WeekRing
        segments={data.segments}
        onchange={data.setAllHours}
        onsplit={data.split}
        centerValue="{Math.round(WEEK_HOURS - data.restHours)}h"
        centerLabel="claimed of 168h"
      />
    </div>

    <div class="mt-3 flex min-h-5 items-center justify-center gap-1.5">
      {#if data.error}
        <span class="t-micro text-danger">{data.error}</span>
      {:else if data.saving || data.dirty}
        <span class="t-micro text-fg-faint">Saving…</span>
      {:else}
        <Check size={12} class="text-fg-faint" />
        <span class="t-micro text-fg-faint">Saved</span>
      {/if}
    </div>

    <div class="mt-4">
      {#each data.drafts as draft, i (draft.key)}
        <CategoryDraftRow
          {draft}
          index={i}
          taken={data.drafts.map((d) => d.color)}
          onchange={(patch) => data.update(draft.key, patch)}
          onremove={() => data.remove(draft)}
        />
      {/each}

      <Divider />
      <div class="flex items-center gap-2 py-3">
        <span class="flex w-8 justify-center">
          <span class="size-3.5 rounded-full" style="background:{restColor}"></span>
        </span>
        <span class="t-body flex-1 text-fg-muted">Rest + Buffer</span>
        <span class="t-data text-fg-muted">{formatHoursAndMinutes(data.restHours)}</span>
      </div>

      <Divider />
      <button
        type="button"
        onclick={() => data.split(data.drafts.length === 0 ? 0 : data.drafts.length - 1)}
        aria-label="Split off a category"
        class="flex w-full items-center gap-2 py-3"
      >
        <span class="flex w-8 justify-center">
          <Plus size={16} class="text-fg-muted" />
        </span>
        <span class="t-label text-fg-muted">Split off a category</span>
      </button>
    </div>
  {/if}
</div>
