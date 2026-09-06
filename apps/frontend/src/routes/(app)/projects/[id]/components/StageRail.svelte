<script lang="ts">
  import { Button } from "$lib/components";
  import type { GateProgress, Project, Stage } from "$lib/projects/types";
  import { Check, Plus, X } from "lucide-svelte";
  import { formatDayKey } from "$lib/projects/decide-on";
  import { DecisionFuse } from "../../components";
  import GatePanel from "./GatePanel.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import StageFields from "./StageFields.svelte";
  import { STATUS_LABELS } from "$lib/projects/templates";

  /**
   * The project's stages down the page: done ones folded to a line, the running one open with
   * its gate and its date, the ones after greyed and editable but not yet counting. The decision
   * strip lives inside the running stage because that is what it is a decision about.
   */
  let {
    project,
    stages,
    gate,
    color,
    ondecide,
  }: { project: Project; stages: readonly Stage[]; gate: GateProgress | null; color: string; ondecide: () => void } = $props();

  const OUTCOME_LABELS = { ship: "Shipped", park: "Parked", kill: "Killed", restart: "Restarted" };

  function addStage() {
    data.addStage(project, { name: "Next", sentence: "", metric: "days", threshold: 7, windowDays: 14, budgetHours: 10 });
  }

  const daysLeft = (stage: Stage) => (data.cardById.get(project.id)?.stage?.id === stage.id ? data.cardById.get(project.id)?.daysLeft : null) ?? null;
</script>

<ol class="space-y-2">
  {#each stages as stage, i (stage.id)}
    {@const done = Boolean(stage.outcome)}
    {@const running = Boolean(stage.startedOn) && !done}
    <li class="rounded-lg border {running ? 'border-line-strong bg-surface' : 'border-line'} {!running && !done ? 'opacity-70' : ''}">
      <div class="flex items-center gap-3 px-4 py-3">
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full border text-fg-muted t-micro"
          style={running ? `border-color:${color};color:${color}` : done ? `background:${color};border-color:${color};color:white` : ""}
        >
          {#if done}<Check size={12} strokeWidth={3} />{:else}{i + 1}{/if}
        </span>
        <input
          value={stage.name}
          oninput={(e) => data.updateStage(stage.id, { name: e.currentTarget.value })}
          aria-label="Stage name"
          class="field-bare t-body-strong -mx-2 flex-1"
        />
        {#if done && stage.outcome}
          <span class="t-micro text-fg-faint">
            {OUTCOME_LABELS[stage.outcome]} {stage.decidedOn ? formatDayKey(stage.decidedOn) : ""}
          </span>
        {:else if running && stage.decideOn}
          <span class="t-micro tabular-nums {(daysLeft(stage) ?? 0) < 0 ? 'text-danger' : 'text-fg-muted'}">
            {formatDayKey(stage.decideOn)}
          </span>
        {:else if !done}
          <Button variant="bare" title="Remove stage" onclick={() => data.removeStage(stage)}>
            {#snippet icon()}<X size={13} class="text-fg-faint" />{/snippet}
          </Button>
        {/if}
      </div>

      {#if done}
        {#if stage.sentence || stage.decisionNote}
          <p class="t-micro px-4 pb-3 text-fg-faint">
            “{stage.sentence}”{stage.decisionNote ? ` — ${stage.decisionNote}` : ""}
          </p>
        {/if}
      {:else}
        <div class="space-y-4 border-t border-line px-4 py-4">
          <StageFields {stage} {project} />
          {#if running && stage.startedOn && stage.decideOn}
            <div class="space-y-2">
              <DecisionFuse startedOn={stage.startedOn} decideOn={stage.decideOn} extendedOn={stage.extendedOn} today={data.today} {color} />
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="t-micro text-fg-muted">
                  Started {formatDayKey(stage.startedOn)} · decided {formatDayKey(stage.decideOn)}
                  {#if stage.extendedOn}
                    · extended {formatDayKey(stage.extendedOn)}{stage.extensionNote ? `: ${stage.extensionNote}` : ""}
                  {/if}
                </span>
                {#if project.status === "held"}
                  <span class="t-micro text-fg-faint">{STATUS_LABELS.held} — passed, not promoted</span>
                {/if}
                <Button size="sm" variant={(daysLeft(stage) ?? 1) <= 0 ? "solid" : "outline"} label="Decide…" onclick={ondecide} />
              </div>
            </div>
            <GatePanel {stage} {gate} {color} />
          {:else if !running}
            <p class="t-micro text-fg-faint">Waits for the stage before it. Its date is set the day it starts.</p>
          {/if}
        </div>
      {/if}
    </li>
  {/each}
  {#if project.template !== "evergreen"}
    <li>
      <button
        type="button"
        onclick={addStage}
        class="press hoverable flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-3 text-fg-muted"
      >
        <Plus size={14} />
        <span class="t-label">Add a stage</span>
      </button>
    </li>
  {/if}
</ol>
