<script lang="ts">
  import { Field, NumberField, Select } from "$lib/components";
  import type { GateMetric, Project, Stage } from "$lib/types";
  import { decideOnFor, formatDayKey } from "$lib/projects/decide-on";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { METRIC_LABELS, templateOf } from "$lib/projects/templates";

  /**
   * What a stage is made of, all editable in place: the gate sentence in words, and the same
   * sentence as a count — metric, threshold, window — plus the budget that sets the date. The
   * line under the budget says where the decision would land at the project's rate, so the
   * arithmetic is visible before it is binding.
   */
  let { stage, project }: { stage: Stage; project: Project } = $props();

  const template = $derived(templateOf(project.template));
  const metrics = $derived<GateMetric[]>(
    template.metrics.length ? [...template.metrics] : ["days", "people", "throughput", "event", "hours"],
  );
  const metricOptions = $derived(metrics.map((value) => ({ value, label: METRIC_LABELS[value] })));

  const preview = $derived(
    stage.decideOn ??
      decideOnFor({
        startedOn: stage.startedOn ?? data.today,
        budgetHours: stage.budgetHours,
        hoursPerWeek: project.hoursPerWeek,
        windowDays: stage.windowDays,
        deadline: project.template === "delivery" ? project.deadline : null,
      }),
  );
</script>

<div class="space-y-3">
  <Field
    variant="bare"
    value={stage.sentence}
    placeholder="The gate, as a sentence: what has to be true"
    oninput={(sentence) => data.updateStage(stage.id, { sentence })}
    ariaLabel="Gate sentence"
    class="-mx-2"
  />
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <Select
      width={150}
      label="What the gate counts"
      value={stage.metric}
      options={metricOptions}
      onchange={(metric) => data.updateStage(stage.id, { metric })}
    />
    {#if stage.metric !== "event"}
      <label class="t-micro flex items-center gap-1.5 text-fg-muted">
        at least
        <NumberField
          value={stage.threshold}
          unit=""
          inputmode="numeric"
          ariaLabel="Threshold"
          onchange={(threshold) => data.updateStage(stage.id, { threshold: Math.max(1, Math.round(threshold)) })}
        />
      </label>
    {/if}
    <label class="t-micro flex items-center gap-1.5 text-fg-muted">
      in the last
      <NumberField
        value={stage.windowDays}
        unit="d"
        inputmode="numeric"
        ariaLabel="Window in days"
        onchange={(windowDays) => data.updateStage(stage.id, { windowDays: Math.max(1, Math.round(windowDays)) })}
      />
    </label>
    <label class="t-micro flex items-center gap-1.5 text-fg-muted">
      budget
      <NumberField
        value={stage.budgetHours}
        unit="h"
        ariaLabel="Budget in hours"
        onchange={(budgetHours) => data.updateStage(stage.id, { budgetHours: Math.max(0, budgetHours) })}
      />
    </label>
  </div>
  {#if !stage.decideOn}
    <p class="t-micro text-fg-faint">
      {#if project.template === "delivery"}
        {project.deadline ? `Decided on the deadline, ${formatDayKey(project.deadline)}.` : "Needs a deadline on the project."}
      {:else if project.hoursPerWeek > 0}
        Starting today, decided on {formatDayKey(preview)} at {project.hoursPerWeek}h a week. The date is set when the stage starts and does not move.
      {:else}
        With no hours claimed the date lands in a week. Claim hours on the project to push it out.
      {/if}
    </p>
  {/if}
</div>
