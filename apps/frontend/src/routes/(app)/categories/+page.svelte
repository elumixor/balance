<script lang="ts">
  import { restColor } from "$lib/colors";
  import AddRow from "$lib/components/AddRow.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import WeekRing from "$lib/components/ring/WeekRing.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SplitPane from "$lib/components/SplitPane.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import { viewport } from "$lib/viewport.svelte";
  import { AUTOSAVE_DELAY_MS, categoryDrafts as data, WEEK_HOURS } from "$lib/week/category-drafts.svelte";
  import CategoryDraftRow from "$lib/week/CategoryDraftRow.svelte";
  import { Check } from "lucide-svelte";

  void data.enter();

  // Changes save themselves a moment after you stop moving things.
  $effect(() => {
    if (!data.savable) return;
    const timeout = setTimeout(() => void data.flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  });
</script>

<Screen title="Week" subtitle="168 hours. Decide where they go before they go." wide>
  {#if data.loadError && !data.categories}
    <LoadError message={data.loadError} onretry={data.load} />
  {:else if !data.categories}
    <div class="flex flex-col items-center gap-4">
      <Skeleton width={232} height={232} radius={116} />
      <Skeleton width="80%" height={16} />
    </div>
  {:else}
    <SplitPane>
      {#snippet aside()}
        <WeekRing
          segments={data.segments}
          onchange={data.setAllHours}
          onsplit={data.split}
          size={viewport.xl ? 300 : 232}
          thickness={viewport.xl ? 32 : 26}
          centerValue="{Math.round(WEEK_HOURS - data.restHours)}h"
          centerLabel="claimed of 168h"
        />

        <div class="mt-4 flex min-h-5 items-center justify-center gap-1.5">
          {#if data.error}
            <span class="t-micro text-danger">{data.error}</span>
          {:else if data.saving || data.dirty}
            <span class="t-micro text-fg-faint">Saving…</span>
          {:else}
            <Check size={12} class="text-fg-faint" />
            <span class="t-micro text-fg-faint">Saved</span>
          {/if}
        </div>
      {/snippet}

      <div class="mt-6 xl:mt-0">
        <Rows items={data.drafts} key={(draft) => draft.key}>
          {#snippet children(draft)}
            <CategoryDraftRow
              {draft}
              taken={data.drafts.map((d) => d.color)}
              onchange={(patch) => data.update(draft.key, patch)}
              onremove={() => data.remove(draft)}
            />
          {/snippet}
        </Rows>

        <Divider />
        <div class="flex items-center gap-2 py-3">
          <span class="flex w-8 justify-center">
            <span class="size-3.5 rounded-full" style="background:{restColor}"></span>
          </span>
          <span class="t-body flex-1 text-fg-muted">Rest + Buffer</span>
          <span class="t-data text-fg-muted">{formatHoursAndMinutes(data.restHours)}</span>
        </div>

        <AddRow
          label="Split off a category"
          indent
          onclick={() => data.split(data.drafts.length === 0 ? 0 : data.drafts.length - 1)}
        />
      </div>
    </SplitPane>
  {/if}
</Screen>
