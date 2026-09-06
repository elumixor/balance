<script lang="ts">
  import { Button, Textarea } from "$lib/components";
import type { GateProgress, Stage } from "$lib/projects/types";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { assistCheckpoint } from "$lib/projects/queries";
  import type { CheckpointHelp } from "$lib/projects/assist";
  import { formatDayKey } from "$lib/projects/decide-on";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { gateReadout } from "$lib/projects/templates";

  /**
   * Every two weeks, one question: did it move? The number and its change since the last look
   * are on the card; the answer and a line about what stopped it are what gets kept, and that
   * line is the next fortnight's work.
   */
  let {
    stage,
    gate,
    day,
    projectName,
  }: { stage: Stage; gate: GateProgress | null; day: string; projectName: string } = $props();

  const count = $derived(gate?.count ?? 0);
  const previous = $derived(stage.checkpoints.at(-1)?.count ?? 0);
  const delta = $derived(count - previous);
  let note = $state("");

  /** After "it didn't": the note is kept, and the model may turn it into the next fortnight's work. */
  let help = $state<CheckpointHelp | null>(null);
  let asking = $state(false);
  let answered = $state<string | null>(null);

  function answer(moved: boolean) {
    const written = note.trim();
    data.logCheckpoint(stage, { day, count, moved, note: written });
    answered = moved ? null : written;
    note = "";
  }

  async function breakDown() {
    if (answered === null) return;
    asking = true;
    try {
      const r = await assistCheckpoint({
        project: projectName,
        stage: stage.name,
        sentence: stage.sentence,
        count,
        threshold: gate?.threshold ?? stage.threshold,
        note: answered,
      });
      help = r.available ? r.suggestion : null;
      if (!r.available) answered = null;
    } finally {
      asking = false;
    }
  }

  function takeTasks() {
    if (!help) return;
    for (const task of help.tasks) {
      const created = data.addTask(stage.id, task.title);
      data.updateTask(created.id, { estimateHours: task.estimateHours });
    }
    help = null;
    answered = null;
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
  {#if help}
    <p class="t-body text-fg">{help.blocker}</p>
    <ul class="space-y-0.5">
      {#each help.tasks as task (task.title)}
        <li class="t-label flex justify-between gap-3 text-fg-muted">
          <span>{task.title}</span>
          <span class="shrink-0 tabular-nums text-fg-faint">{formatHoursDecimal(task.estimateHours)}</span>
        </li>
      {/each}
    </ul>
    <div class="flex gap-2">
      <Button size="sm" label="Add as subtasks" onclick={takeTasks} />
      <Button size="sm" variant="outline" label="Leave it" onclick={() => { help = null; answered = null; }} />
    </div>
  {:else if answered !== null}
    <p class="t-label text-fg-muted">Noted. That is the next two weeks' work.</p>
    <Button size="sm" variant="outline" label="Break it into subtasks" loading={asking} onclick={breakDown} />
  {:else}
    <p class="t-body text-fg">Did it move?</p>
    <Textarea bind:value={note} rows={2} placeholder="If not — what stopped you? That becomes the next two weeks." ariaLabel="Checkpoint note" />
    <div class="flex gap-2">
      <Button size="sm" label="It moved" onclick={() => answer(true)} />
      <Button size="sm" variant="outline" label="It didn't" onclick={() => answer(false)} />
    </div>
  {/if}
</div>
