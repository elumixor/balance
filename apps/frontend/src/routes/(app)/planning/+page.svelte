<script lang="ts">
  import { activitiesData } from "$lib/activities/activities-data.svelte";
  import ActivityRow from "$lib/activities/ActivityRow.svelte";
  import AddRow from "$lib/components/AddRow.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import { AUTOSAVE_DELAY_MS, categoryDrafts as week, WEEK_HOURS } from "$lib/week/category-drafts.svelte";
  import PlanDial from "$lib/week/PlanDial.svelte";

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

  $effect(() => {
    if (!activities.savable) return;
    const timeout = setTimeout(() => void activities.flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  });
</script>

<Screen title="Planning" wide>
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

      {#if week.error}
        <div class="mt-4 flex min-h-5 items-center justify-center">
          <span class="t-micro text-danger">{week.error}</span>
        </div>
      {/if}

      <p class="t-micro mx-auto mt-4 max-w-[40ch] text-center text-fg-faint">
        Tap a slice's icon to change how it looks, drag a seam to move hours between neighbours, or
        right-click a slice to cut a new category out of it.
      </p>
    </div>

    <!-- The rule is wider than the one between rows: this is the next thing, not the next row. -->
    <section class="mt-12 border-t border-line pt-8">
      <SectionHeader title="Activities" />

      <InlineError message={activities.error} />

      {#if activities.loadError && activities.drafts.length === 0}
        <LoadError message={activities.loadError} onretry={activities.load} />
      {:else if week.drafts.length === 0}
        <!-- An activity is a split across categories, so there is nothing to split yet. -->
        <EmptyState title="Nothing to split yet." hint="Cut the ring into categories first." />
      {:else}
        {#if activities.drafts.length === 0}
          <EmptyState
            title="No activities yet."
            hint="An activity is something you do — and how its hours land across your categories."
          />
        {/if}

        <Rows items={activities.drafts} key={(draft) => draft.key}>
          {#snippet children(draft)}
            <ActivityRow
              {draft}
              categoryById={activities.categoryById}
              plannedCategories={activities.planned}
              focus={activities.focusKey === draft.key}
              onupdate={(patch) => activities.update(draft.key, patch)}
              onfocused={() => (activities.focusKey = null)}
              onarchive={() => activities.archive(draft)}
            />
          {/snippet}
        </Rows>

        <AddRow label="Add activity" onclick={() => activities.add()} />
      {/if}
    </section>
  {/if}
</Screen>
