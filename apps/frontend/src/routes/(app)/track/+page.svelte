<script lang="ts">
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import SplitPane from "$lib/components/SplitPane.svelte";
  import LoggedEntries from "$lib/track/LoggedEntries.svelte";
  import QuickStart from "$lib/track/QuickStart.svelte";
  import RunningCard from "$lib/track/RunningCard.svelte";
  import { trackData as data } from "$lib/track/track-data.svelte";

  void data.enter();
</script>

<Screen title="Track" wide>
  <InlineError message={data.actionError} />

  {#if data.loadError && !data.loaded}
    <LoadError message={data.loadError} onretry={data.load} />
  {:else if !data.loaded}
    <SkeletonRows count={5} />
  {:else}
    <!-- What you could start, and what you already did: side by side once there's room for both. -->
    <SplitPane>
      {#snippet aside()}
        <div class="w-full">
          {#if data.running}
            <RunningCard
              entry={data.running}
              splits={data.splitsFor(data.running.activityId)}
              onstop={data.stop}
              stopping={data.stopping}
            />
          {:else if data.activities.length === 0}
            <Panel>
              <EmptyState
                title="Nothing to track yet"
                hint="Add an activity on the Activities tab, then start it here."
              />
            </Panel>
          {:else}
            <SectionHeader title="Start" />
            <QuickStart tiles={data.tiles} onstart={data.start} startingId={data.startingId} />
          {/if}
        </div>
      {/snippet}

      <div class="mt-8 xl:mt-0">
        <LoggedEntries {data} />
      </div>
    </SplitPane>
  {/if}
</Screen>
