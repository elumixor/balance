<script lang="ts">
  import Divider from "$lib/components/Divider.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import { formatDayHeading } from "$lib/format";
  import { Plus } from "lucide-svelte";
  import EntryEditor from "./EntryEditor.svelte";
  import EntryRow from "./EntryRow.svelte";
  import type { TrackData } from "./track-data.svelte";

  /** The Track screen's "Logged" section: entries grouped by day, plus the add-entry affordance. */
  let { data }: { data: TrackData } = $props();

  const toggle = (id: string) => (data.editing = data.editing === id ? null : id);
</script>

<div class="mt-6">
  <SectionHeader title="Logged" />

  {#if data.days.length === 0}
    <EmptyState title="No entries yet." hint="Start a timer, or add one by hand below." />
  {:else}
    {#each data.days as day (day.key)}
      <div class="mb-3">
        <p class="t-micro mb-0.5 text-fg-faint">{formatDayHeading(day.date)}</p>
        {#each day.items as entry, i (entry.id)}
          <div class="list-item-in" style="animation-delay:{Math.min(i, 8) * 35}ms">
            {#if i > 0}<Divider />{/if}
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
          </div>
        {/each}
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
    <button
      type="button"
      onclick={() => (data.editing = "new")}
      disabled={data.activities.length === 0}
      aria-label="Add an entry by hand"
      class="flex w-full items-center gap-2 border-t border-line py-3"
    >
      <Plus size={16} class="text-fg-muted" />
      <span class="t-label text-fg-muted">Add an entry</span>
    </button>
  {/if}
</div>
