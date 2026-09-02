<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import Field from "$lib/components/Field.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import Select from "$lib/components/Select.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import type { GateMetric, GateProgress, Project, Stage, StageOutcome } from "$lib/types";
  import { formatHoursDecimal } from "$lib/format";
  import { formatDayKey } from "./decide-on";
  import { projectsData as data } from "./projects-data.svelte";
  import { gateReadout, METRIC_LABELS } from "./templates";

  /**
   * Decision day. The count, the threshold, the hours that went in and what the checkpoints said
   * are laid out, and then one of the outcomes is pressed — by a person. Nothing here recommends;
   * that is a later moment's job. The rules that don't bend are enforced where they can be seen:
   * one extension, a different sentence for a restart, a trigger for a park.
   */
  let {
    open,
    onclose,
    stage,
    project,
    gate,
    hoursInvested,
    isLast,
  }: {
    open: boolean;
    onclose: () => void;
    stage: Stage;
    project: Project;
    gate: GateProgress | null;
    hoursInvested: number;
    /** No stage waits after this one, so shipping it ships the project. */
    isLast: boolean;
  } = $props();

  type Choice = StageOutcome | "extend" | "hold";
  let choice = $state<Choice | null>(null);
  let note = $state("");
  const blankRestart = () => ({
    name: "",
    sentence: "",
    metric: stage.metric as GateMetric,
    threshold: stage.threshold,
    windowDays: stage.windowDays,
    budgetHours: stage.budgetHours,
    hoursPerWeek: project.hoursPerWeek || 2,
  });
  let restart = $state(blankRestart());

  // Each opening starts from the stage as it is now — the sheet may outlive a stage or two.
  $effect(() => {
    if (!open) return;
    choice = null;
    note = "";
    restart = blankRestart();
  });

  const passed = $derived(gate?.passed ?? false);
  const sameSentence = $derived(restart.sentence.trim().toLowerCase() === stage.sentence.trim().toLowerCase());

  const valid = $derived.by(() => {
    switch (choice) {
      case "extend":
      case "park":
        return note.trim().length > 0;
      case "restart":
        return restart.name.trim().length > 0 && restart.sentence.trim().length > 0 && !sameSentence;
      case null:
        return false;
      default:
        return true;
    }
  });

  function confirm() {
    if (!choice || !valid) return;
    if (choice === "extend") data.extend(stage, note.trim());
    else if (choice === "hold") data.setStatus(project, "held");
    else if (choice === "restart") {
      data.decide(stage, {
        outcome: "restart",
        note: note.trim(),
        restart: {
          name: restart.name.trim(),
          sentence: restart.sentence.trim(),
          metric: restart.metric,
          threshold: Math.max(1, Math.round(restart.threshold)),
          windowDays: Math.max(1, Math.round(restart.windowDays)),
          budgetHours: Math.max(0, restart.budgetHours),
          hoursPerWeek: project.status === "parked" ? restart.hoursPerWeek : undefined,
        },
      });
    } else data.decide(stage, { outcome: choice, note: note.trim() });
    choice = null;
    note = "";
    onclose();
  }

  const OUTCOMES = $derived<{ value: Choice; label: string; hint: string }[]>([
    { value: "ship", label: isLast ? "Ship" : "Promote", hint: isLast ? "Done. The card stays." : "The next stage starts today." },
    ...(passed ? [{ value: "hold" as const, label: "Hold", hint: "Passed, and kept here on purpose." }] : []),
    ...(stage.extendedOn ? [] : [{ value: "extend" as const, label: "Extend", hint: "One named fix, two weeks, once." }]),
    { value: "park", label: "Park", hint: "Hours drop to zero until a trigger." },
    { value: "kill", label: "Kill", hint: "Archived. The card is kept." },
    { value: "restart", label: "Restart", hint: "A different bet: new sentence, clock resets." },
  ]);
</script>

<Dialog title="Decide: {stage.name}" {open} {onclose}>
  <div class="space-y-5">
    <div class="grid grid-cols-3 gap-3">
      <div>
        <span class="t-micro block text-fg-faint">Gate</span>
        <span class="t-data-strong {passed ? 'text-positive' : 'text-fg'}">
          {gate ? gateReadout(stage.metric, gate.count, gate.threshold) : "—"}
        </span>
      </div>
      <div>
        <span class="t-micro block text-fg-faint">Invested</span>
        <span class="t-data-strong text-fg">{formatHoursDecimal(hoursInvested)}</span>
      </div>
      <div>
        <span class="t-micro block text-fg-faint">Due</span>
        <span class="t-data-strong text-fg">{stage.decideOn ? formatDayKey(stage.decideOn) : "—"}</span>
      </div>
    </div>
    {#if gate && !gate.measurable}
      <p class="t-micro text-fg-faint">The window hasn't opened, so the count says nothing yet — a decision now is a decision without it.</p>
    {/if}
    <p class="t-label text-fg-muted">“{stage.sentence || "No gate sentence."}”</p>
    {#if stage.checkpoints.length > 0}
      <ul class="space-y-1">
        {#each stage.checkpoints as c (c.day)}
          <li class="t-micro text-fg-muted">
            <span class="text-fg-faint">{formatDayKey(c.day)}</span> · {c.count} · {c.moved ? "moved" : "stuck"}{c.note ? ` — ${c.note}` : ""}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="grid grid-cols-2 gap-2">
      {#each OUTCOMES as outcome (outcome.value)}
        <button
          type="button"
          aria-pressed={choice === outcome.value}
          onclick={() => (choice = outcome.value)}
          class="press rounded-md border p-3 text-left {choice === outcome.value
            ? 'border-ink bg-surface-alt'
            : 'border-line hover:border-line-strong'}"
        >
          <span class="t-label block text-fg">{outcome.label}</span>
          <span class="t-micro block text-fg-muted">{outcome.hint}</span>
        </button>
      {/each}
    </div>

    {#if choice === "restart"}
      <div class="space-y-2">
        <Field bind:value={restart.name} placeholder="New stage name" ariaLabel="New stage name" />
        <Field bind:value={restart.sentence} placeholder="The new gate, as a sentence" ariaLabel="New gate sentence" />
        {#if sameSentence && restart.sentence.trim()}
          <p class="t-micro text-danger">Same sentence means it isn't ready. A restart is a different bet.</p>
        {/if}
        <div class="flex flex-wrap items-center gap-3">
          <Select
            width={150}
            label="Metric"
            value={restart.metric}
            options={(["days", "people", "throughput", "event", "hours"] as GateMetric[]).map((value) => ({ value, label: METRIC_LABELS[value] }))}
            onchange={(metric) => (restart.metric = metric)}
          />
          <NumberField value={restart.threshold} unit="" inputmode="numeric" ariaLabel="Threshold" onchange={(v) => (restart.threshold = v)} />
          <NumberField value={restart.windowDays} unit="d" inputmode="numeric" ariaLabel="Window" onchange={(v) => (restart.windowDays = v)} />
          <NumberField value={restart.budgetHours} unit="h" ariaLabel="Budget" onchange={(v) => (restart.budgetHours = v)} />
          {#if project.status === "parked"}
            <NumberField value={restart.hoursPerWeek} unit="h/wk" ariaLabel="Hours a week" onchange={(v) => (restart.hoursPerWeek = v)} />
          {/if}
        </div>
      </div>
    {/if}

    {#if choice && choice !== "hold"}
      <Textarea
        bind:value={note}
        rows={2}
        placeholder={choice === "extend"
          ? "The one fix this buys time for"
          : choice === "park"
            ? "What has to be true to unpark it"
            : "Why (optional)"}
        ariaLabel="Note"
      />
    {/if}

    <div class="flex justify-end gap-2">
      <Button size="sm" variant="outline" label="Not now" onclick={onclose} />
      <Button size="sm" label={choice ? (OUTCOMES.find((o) => o.value === choice)?.label ?? "Confirm") : "Choose an outcome"} disabled={!valid} onclick={confirm} />
    </div>
  </div>
</Dialog>
