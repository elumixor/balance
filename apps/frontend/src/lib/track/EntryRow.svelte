<script lang="ts">
  import IconButton from "$lib/components/IconButton.svelte";
  import SplitBar from "$lib/components/SplitBar.svelte";
  import { formatClock, formatHoursAndMinutes } from "$lib/format";
  import type { Entry, Split } from "$lib/types";
  import { Trash2 } from "lucide-svelte";

  let {
    entry,
    splits,
    expanded,
    ontoggle,
    ondelete,
  }: { entry: Entry; splits: Split[]; expanded: boolean; ontoggle: () => void; ondelete: () => void } = $props();

  const hours = $derived(
    (new Date(entry.endedAt ?? Date.now()).getTime() - new Date(entry.startedAt).getTime()) / 3_600_000,
  );
</script>

<div class="flex items-center gap-3">
  <button
    type="button"
    onclick={ontoggle}
    aria-expanded={expanded}
    aria-label="{entry.activityName}, {formatHoursAndMinutes(hours)}"
    class="flex flex-1 items-center gap-3 py-3 text-left"
  >
    <SplitBar {splits} vertical thickness={3} class="min-h-[34px] self-stretch" />

    <span class="flex-1 space-y-0.5">
      <span class="t-body-strong block truncate">{entry.activityName}</span>
      <span class="t-data-micro block text-fg-muted">
        {formatClock(new Date(entry.startedAt))}{entry.endedAt
          ? `–${formatClock(new Date(entry.endedAt))}`
          : " · running"}{entry.note ? `  ${entry.note}` : ""}
      </span>
    </span>

    <span class="t-data {entry.endedAt ? '' : 'text-fg-muted'}">{formatHoursAndMinutes(hours)}</span>
  </button>

  {#if expanded}
    <IconButton label="Delete {entry.activityName} entry" onclick={ondelete}>
      <Trash2 size={15} class="text-danger" />
    </IconButton>
  {/if}
</div>
