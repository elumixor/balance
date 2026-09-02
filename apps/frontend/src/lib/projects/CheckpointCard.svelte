<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import type { GateProgress, Stage } from "$lib/types";
  import { formatDayKey } from "./decide-on";
  import { projectsData as data } from "./projects-data.svelte";
  import { gateReadout } from "./templates";

  /**
   * Every two weeks, one question: did it move? The number and its change since the last look
   * are on the card; the answer and a line about what stopped it are what gets kept, and that
   * line is the next fortnight's work.
   */
  let { stage, gate, day }: { stage: Stage; gate: GateProgress | null; day: string } = $props();

  const count = $derived(gate?.count ?? 0);
  const previous = $derived(stage.checkpoints.at(-1)?.count ?? 0);
  const delta = $derived(count - previous);
  let note = $state("");

  function answer(moved: boolean) {
    data.logCheckpoint(stage, { day, count, moved, note: note.trim() });
    note = "";
  }
</script>

<div class="space-y-3 rounded-lg border border-line-strong bg-surface p-4">
  <div class="flex items-baseline justify-between gap-3">
    <span class="t-label text-fg-muted">Checkpoint · {formatDayKey(day)}</span>
    <span class="t-data-strong text-fg">
      {gate ? gateReadout(stage.metric, count, gate.threshold) : "—"}
      <span class="t-micro {delta > 0 ? 'text-positive' : delta < 0 ? 'text-danger' : 'text-fg-faint'}">
        {delta > 0 ? `+${delta}` : delta === 0 ? "±0" : delta} since last look
      </span>
    </span>
  </div>
  <p class="t-body text-fg">Did it move?</p>
  <Textarea bind:value={note} rows={2} placeholder="If not — what stopped you? That becomes the next two weeks." ariaLabel="Checkpoint note" />
  <div class="flex gap-2">
    <Button size="sm" label="It moved" onclick={() => answer(true)} />
    <Button size="sm" variant="outline" label="It didn't" onclick={() => answer(false)} />
  </div>
</div>
