<script lang="ts">
  import { activitiesData } from "$lib/activities/activities-data.svelte";
  import ActivityEditor from "$lib/activities/ActivityEditor.svelte";
  import ActivityRow from "$lib/activities/ActivityRow.svelte";
  import { restColor } from "$lib/colors";
  import AddRow from "$lib/components/AddRow.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import WeekRing from "$lib/components/ring/WeekRing.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import SplitPane from "$lib/components/SplitPane.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import { viewport } from "$lib/viewport.svelte";
  import {
    AUTOSAVE_DELAY_MS,
    categoryDrafts as week,
    toUnit,
    WEEK_HOURS,
    type PlanUnit,
  } from "$lib/week/category-drafts.svelte";
  import CategoryDraftRow from "$lib/week/CategoryDraftRow.svelte";
  import { Check } from "lucide-svelte";

  /**
   * One screen for the week you mean to have: the ring cuts 168 hours into categories, and the
   * activities underneath say what actually fills them. They're the same job in two grains —
   * an activity's split only means anything against the categories directly above it — so they
   * read as one page rather than two tabs you have to hold in your head at once.
   */
  const activities = activitiesData;

  void week.enter();
  void activities.enter();

  const UNITS: PlanUnit[] = ["h", "%"];
  const claimedHours = $derived(WEEK_HOURS - week.restHours);

  /** The ring's centre answers in whatever unit the list is being read in. */
  const claimed = $derived(
    week.unit === "h" ? `${Math.round(claimedHours)}h` : `${Math.round((claimedHours / WEEK_HOURS) * 100)}%`,
  );

  // Changes save themselves a moment after you stop moving things.
  $effect(() => {
    if (!week.savable) return;
    const timeout = setTimeout(() => void week.flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  });
</script>

<Screen title="Planning" subtitle="168 hours. Decide where they go before they go." wide>
  {#if week.loadError && !week.categories}
    <LoadError message={week.loadError} onretry={week.load} />
  {:else if !week.categories}
    <div class="flex flex-col items-center gap-4">
      <Skeleton width={232} height={232} radius={116} />
      <Skeleton width="80%" height={16} />
    </div>
  {:else}
    <SplitPane>
      {#snippet aside()}
        <WeekRing
          segments={week.segments}
          onchange={week.setAllHours}
          onsplit={week.split}
          size={viewport.xl ? 300 : 232}
          thickness={viewport.xl ? 32 : 26}
          centerValue={claimed}
          centerLabel="claimed of 168h"
        />

        <div class="mt-4 flex min-h-5 items-center justify-center gap-1.5">
          {#if week.error}
            <span class="t-micro text-danger">{week.error}</span>
          {:else if week.saving || week.dirty}
            <span class="t-micro text-fg-faint">Saving…</span>
          {:else}
            <Check size={12} class="text-fg-faint" />
            <span class="t-micro text-fg-faint">Saved</span>
          {/if}
        </div>

        <p class="t-micro mt-5 max-w-[32ch] text-center text-fg-faint">
          Drag a seam to move hours between neighbours, or cut a new category out of one you have.
        </p>
      {/snippet}

      <div class="mt-8 xl:mt-0">
        <SectionHeader title="Categories">
          {#snippet trailing()}
            <!-- The same plan, read two ways: hours a week, or a share of the week. -->
            <div class="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Show plan in">
              {#each UNITS as option (option)}
                <button
                  type="button"
                  aria-pressed={week.unit === option}
                  onclick={() => (week.unit = option)}
                  class="t-data-micro px-2.5 py-1 transition-colors {week.unit === option
                    ? 'bg-ink text-ink-fg'
                    : 'text-fg-muted hover:bg-surface-alt'}"
                >
                  {option}
                </button>
              {/each}
            </div>
          {/snippet}
        </SectionHeader>

        <Rows items={week.drafts} key={(draft) => draft.key}>
          {#snippet children(draft)}
            <CategoryDraftRow
              {draft}
              taken={week.drafts.map((d) => d.color)}
              unit={week.unit}
              onchange={(patch) => week.update(draft.key, patch)}
              onremove={() => week.remove(draft)}
            />
          {/snippet}
        </Rows>

        <Divider />
        <div class="flex items-center gap-2 py-3">
          <span class="flex w-8 justify-center">
            <span class="size-3.5 rounded-full" style="background:{restColor}"></span>
          </span>
          <span class="t-body flex-1 text-fg-muted">Rest + Buffer</span>
          <span class="t-data pr-9 text-fg-muted">
            {week.unit === "h" ? formatHoursAndMinutes(week.restHours) : `${toUnit(week.restHours, "%")}%`}
          </span>
        </div>

        <AddRow
          label="Split off a category"
          indent
          onclick={() => week.split(week.drafts.length === 0 ? 0 : week.drafts.length - 1)}
        />

        <!-- The rule is wider than the one between rows: this is the next thing, not the next row. -->
        <section class="mt-12 border-t border-line pt-8">
          <SectionHeader title="Activities">
            {#snippet trailing()}
              <span class="t-micro text-fg-faint">how each one splits</span>
            {/snippet}
          </SectionHeader>

          <InlineError message={activities.actionError} />

          {#if activities.loadError && !activities.activities}
            <LoadError message={activities.loadError} onretry={activities.load} />
          {:else if !activities.activities}
            <SkeletonRows count={3} />
          {:else if week.drafts.length === 0}
            <!-- An activity is a split across categories, so there is nothing to split yet. -->
            <EmptyState title="Nothing to split yet." hint="Cut the ring into categories first." />
          {:else}
            {#if activities.activities.length === 0 && activities.editing !== "new"}
              <EmptyState
                title="No activities yet."
                hint="An activity is something you do — and how its hours land across your categories."
              />
            {/if}

            <Rows items={activities.activities} key={(activity) => activity.id}>
              {#snippet children(activity)}
                <ActivityRow
                  {activity}
                  categoryById={activities.categoryById}
                  plannedCategories={activities.planned}
                  expanded={activities.editing === activity.id}
                  ontoggle={() => (activities.editing = activities.editing === activity.id ? null : activity.id)}
                  oncancel={() => (activities.editing = null)}
                  onsave={(draft) => activities.save(activity.id, draft)}
                  onarchive={() => activities.archive(activity)}
                />
              {/snippet}
            </Rows>

            {#if activities.editing === "new"}
              <Panel class="mt-3">
                <ActivityEditor
                  activity={null}
                  categories={activities.planned}
                  oncancel={() => (activities.editing = null)}
                  onsave={(draft) => activities.save("new", draft)}
                />
              </Panel>
            {:else}
              <AddRow label="Add activity" onclick={() => (activities.editing = "new")} />
            {/if}
          {/if}
        </section>
      </div>
    </SplitPane>
  {/if}
</Screen>
