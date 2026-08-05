<script lang="ts">
  import { ActivitiesData } from "$lib/activities/activities-data.svelte";
  import ActivityEditor from "$lib/activities/ActivityEditor.svelte";
  import ActivityRow from "$lib/activities/ActivityRow.svelte";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import ScreenTitle from "$lib/components/ScreenTitle.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import { Plus } from "lucide-svelte";

  const data = new ActivitiesData();
  void data.load();
</script>

<div class="safe-top px-5 pt-4 pb-10">
  <ScreenTitle title="Activities" subtitle={data.activities ? `${data.activities.length} active` : undefined}>
    {#snippet trailing()}
      <AccountMenu />
    {/snippet}
  </ScreenTitle>

  <InlineError message={data.actionError} />

  {#if data.loadError && !data.activities}
    <LoadError message={data.loadError} onretry={data.load} />
  {:else if !data.activities}
    <SkeletonRows count={5} />
  {:else}
    {#if data.activities.length === 0 && data.editing !== "new"}
      <EmptyState
        title="No activities yet."
        hint="An activity is something you do — and how it splits across your week."
      />
    {/if}

    {#each data.activities as activity, i (activity.id)}
      <ActivityRow
        {activity}
        index={i}
        categoryById={data.categoryById}
        plannedCategories={data.planned}
        expanded={data.editing === activity.id}
        ontoggle={() => (data.editing = data.editing === activity.id ? null : activity.id)}
        oncancel={() => (data.editing = null)}
        onsave={(draft) => data.save(activity.id, draft)}
        onarchive={() => data.archive(activity)}
      />
    {/each}

    <Divider />
    {#if data.editing === "new"}
      <Panel class="mt-3">
        <ActivityEditor
          activity={null}
          categories={data.planned}
          oncancel={() => (data.editing = null)}
          onsave={(draft) => data.save("new", draft)}
        />
      </Panel>
    {:else}
      <button
        type="button"
        onclick={() => (data.editing = "new")}
        aria-label="Add activity"
        class="flex w-full items-center gap-3 py-3"
      >
        <Plus size={16} class="text-fg-muted" />
        <span class="t-label text-fg-muted">Add activity</span>
      </button>
    {/if}
  {/if}
</div>
