<script lang="ts">
  import { activitiesData as data } from "$lib/activities/activities-data.svelte";
  import ActivityEditor from "$lib/activities/ActivityEditor.svelte";
  import ActivityRow from "$lib/activities/ActivityRow.svelte";
  import AddRow from "$lib/components/AddRow.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";

  void data.enter();

  const count = $derived(data.activities?.length ?? 0);
</script>

<!-- Rows this dense read badly across a full desktop width, so the list keeps its own measure
     inside the wider Planning frame. -->
<div class="max-w-2xl">
  <InlineError message={data.actionError} />

  {#if data.loadError && !data.activities}
    <LoadError message={data.loadError} onretry={data.load} />
  {:else if !data.activities}
    <SkeletonRows count={5} />
  {:else if data.planned.length === 0}
    <!-- An activity is defined as a split across categories, so there is nothing to split yet. -->
    <EmptyState title="Shape your week first." hint="Activities split their hours across the categories you plan.">
      {#snippet action()}
        <a href="/planning/week" class="t-label underline underline-offset-4">Plan the week</a>
      {/snippet}
    </EmptyState>
  {:else}
    <SectionHeader title="Activities">
      {#snippet trailing()}
        <span class="t-micro text-fg-faint">{count} active</span>
      {/snippet}
    </SectionHeader>

    {#if data.activities.length === 0 && data.editing !== "new"}
      <EmptyState
        title="No activities yet."
        hint="An activity is something you do — and how it splits across your week."
      />
    {/if}

    <Rows items={data.activities} key={(activity) => activity.id}>
      {#snippet children(activity)}
        <ActivityRow
          {activity}
          categoryById={data.categoryById}
          plannedCategories={data.planned}
          expanded={data.editing === activity.id}
          ontoggle={() => (data.editing = data.editing === activity.id ? null : activity.id)}
          oncancel={() => (data.editing = null)}
          onsave={(draft) => data.save(activity.id, draft)}
          onarchive={() => data.archive(activity)}
        />
      {/snippet}
    </Rows>

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
      <AddRow label="Add activity" onclick={() => (data.editing = "new")} />
    {/if}
  {/if}
</div>
