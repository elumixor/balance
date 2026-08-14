<script lang="ts">
  import { activitiesData } from "$lib/activities/activities-data.svelte";
  import ActivityEditor from "$lib/activities/ActivityEditor.svelte";
  import ActivityRow from "$lib/activities/ActivityRow.svelte";
  import AddRow from "$lib/components/AddRow.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import { AUTOSAVE_DELAY_MS, categoryDrafts as week, WEEK_HOURS } from "$lib/week/category-drafts.svelte";
  import PlanDial from "$lib/week/PlanDial.svelte";
  import { Check } from "lucide-svelte";

  /**
   * One screen for the week you mean to have: the ring cuts 168 hours into categories, and the
   * activities underneath say what actually fills them. They're the same job in two grains —
   * an activity's split only means anything against the categories directly above it — so they
   * read as one page rather than two tabs you have to hold in your head at once.
   *
   * The categories have no list of their own: each one labels its own slice from the side, which
   * is the only place the shape and the numbers can't drift apart.
   */
  const activities = activitiesData;

  void week.enter();
  void activities.enter();

  const claimedHours = $derived(WEEK_HOURS - week.restHours);
  const claimedPercent = $derived(Math.round((claimedHours / WEEK_HOURS) * 100));

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
    <div class="mx-auto max-w-3xl">
      <PlanDial
        segments={week.segments}
        drafts={week.drafts}
        onhours={week.setAllHours}
        onsplit={week.split}
        onupdate={(key, patch) => week.update(key, patch)}
        onremove={(draft) => week.remove(draft)}
        centerValue="{Math.round(claimedHours)}h"
        centerLabel="{claimedPercent}% of 168h claimed"
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

      <p class="t-micro mx-auto mt-4 max-w-[40ch] text-center text-fg-faint">
        Tap a slice's icon to change how it looks, drag a seam to move hours between neighbours, or
        right-click a slice to cut a new category out of it.
      </p>
    </div>

    <!-- The rule is wider than the one between rows: this is the next thing, not the next row. -->
    <section class="mt-12 border-t border-line pt-8">
      <SectionHeader title="Activities" />

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
  {/if}
</Screen>
