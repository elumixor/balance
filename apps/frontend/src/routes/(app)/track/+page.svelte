<script lang="ts">
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import ScreenTitle from "$lib/components/ScreenTitle.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import LoggedEntries from "$lib/track/LoggedEntries.svelte";
  import QuickStart from "$lib/track/QuickStart.svelte";
  import RunningCard from "$lib/track/RunningCard.svelte";
  import { TrackData } from "$lib/track/track-data.svelte";

  const data = new TrackData();
  void data.load();
</script>

<div class="safe-top px-5 pt-4 pb-10">
  <ScreenTitle title="Track">
    {#snippet trailing()}
      <AccountMenu />
    {/snippet}
  </ScreenTitle>
  <InlineError message={data.actionError} />

  {#if data.loadError && !data.loaded}
    <LoadError message={data.loadError} onretry={data.load} />
  {:else if !data.loaded}
    <SkeletonRows count={5} />
  {:else if data.running}
    <RunningCard
      entry={data.running}
      splits={data.splitsFor(data.running.activityId)}
      onstop={data.stop}
      stopping={data.stopping}
    />
  {:else if data.activities.length === 0}
    <Panel>
      <EmptyState title="Nothing to track yet" hint="Add an activity on the Activities tab, then start it here." />
    </Panel>
  {:else}
    <SectionHeader title="Start" />
    <QuickStart tiles={data.tiles} onstart={data.start} startingId={data.startingId} />
  {/if}

  {#if data.loaded}
    <LoggedEntries {data} />
  {/if}
</div>
