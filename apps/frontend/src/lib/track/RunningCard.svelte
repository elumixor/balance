<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import TimerRing from "$lib/components/ring/TimerRing.svelte";
  import { formatClock, formatDuration } from "$lib/format";
  import type { Entry, Split } from "$lib/types";
  import { Square } from "lucide-svelte";
  import { onDestroy } from "svelte";

  let {
    entry,
    splits,
    onstop,
    stopping,
  }: { entry: Entry; splits: Split[]; onstop: () => void; stopping: boolean } = $props();

  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => clearInterval(tick));

  const elapsed = $derived(now - new Date(entry.startedAt).getTime());
</script>

<Panel class="flex flex-col items-center gap-4 py-6">
  <TimerRing {splits} elapsedMs={elapsed} size={186} thickness={12}>
    <span class="t-readout">{formatDuration(elapsed)}</span>
    <span class="t-micro text-fg-muted">since {formatClock(new Date(entry.startedAt))}</span>
  </TimerRing>

  <div class="flex flex-col items-center gap-0.5 px-3 text-center">
    <h2 class="t-heading truncate">{entry.activityName}</h2>
    {#if entry.note}
      <p class="t-label text-fg-muted">{entry.note}</p>
    {/if}
  </div>

  <Button label="Stop" onclick={onstop} loading={stopping} class="self-stretch">
    {#snippet icon()}
      <Square size={14} fill="currentColor" />
    {/snippet}
  </Button>
</Panel>
