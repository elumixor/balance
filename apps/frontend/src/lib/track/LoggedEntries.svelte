<script lang="ts">
  import AddRow from "$lib/components/AddRow.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import { formatDayHeading } from "$lib/format";
  import EntryEditor from "./EntryEditor.svelte";
  import EntryRow from "./EntryRow.svelte";
  import type { TrackData } from "./track-data.svelte";

  /** The Track screen's "Logged" section: entries grouped by day, plus the add-entry affordance. */
  let { data }: { data: TrackData } = $props();

  const toggle = (id: string) => (data.editing = data.editing === id ? null : id);
</script>

<SectionHeader title="Logged" />

{#if data.days.length === 0}
  <EmptyState title="No entries yet." hint="Start a timer, or add one by hand below." />
{:else}
  {#each data.days as day (day.key)}
    <div class="mb-3">
      <p class="t-micro mb-0.5 text-fg-faint">{formatDayHeading(day.date)}</p>
      <Rows items={day.items} key={(entry) => entry.id}>
        {#snippet children(entry)}
          <EntryRow
            {entry}
            splits={data.splitsFor(entry.activityId)}
            expanded={data.editing === entry.id}
            ontoggle={() => toggle(entry.id)}
            ondelete={() => data.remove(entry)}
          />
          {#if data.editing === entry.id}
            <Panel class="mb-3">
              <EntryEditor
                {entry}
                activities={data.activities}
                oncancel={() => (data.editing = null)}
                onsave={(draft) => data.save(entry.id, draft)}
              />
            </Panel>
          {/if}
        {/snippet}
      </Rows>
    </div>
  {/each}
{/if}

{#if data.editing === "new"}
  <Panel class="py-0">
    <EntryEditor
      entry={null}
      activities={data.activities}
      oncancel={() => (data.editing = null)}
      onsave={(draft) => data.save("new", draft)}
    />
  </Panel>
{:else}
  <AddRow label="Add an entry" onclick={() => (data.editing = "new")} disabled={data.activities.length === 0} />
{/if}
