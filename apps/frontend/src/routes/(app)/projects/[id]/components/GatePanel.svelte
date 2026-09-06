<script lang="ts">
  import { Button } from "$lib/components";
  import { gateEvents } from "$lib/core/synced.svelte";
  import type { GateProgress, Stage } from "$lib/projects/types";
  import { CircleDashed, PenLine, X } from "lucide-svelte";
  import { formatDayKey } from "$lib/projects/decide-on";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { gateReadout } from "$lib/projects/templates";

  /**
   * The running stage's number, and the rows behind it that nothing observed. The count is the
   * server's — calendar blocks tagged to the project plus the rows here — and this only says what
   * it is. A gate whose window hasn't opened says so rather than reading as zero.
   */
  let { stage, gate, color }: { stage: Stage; gate: GateProgress | null; color: string } = $props();

  const manual = $derived(gateEvents.all.filter((e) => e.stageId === stage.id));
  let who = $state("");
  let what = $state("");
  let amount = $state(1);

  /** The metric decides what a manual row needs: a name, a thing, an amount, or nothing. */
  function log() {
    switch (stage.metric) {
      case "people":
        if (!who.trim()) return;
        data.logManual(stage.id, { actorKey: who.trim(), note: null, quantity: 1 });
        who = "";
        break;
      case "throughput":
        data.logManual(stage.id, { actorKey: null, note: what.trim() || null, quantity: Math.max(1, amount) });
        what = "";
        amount = 1;
        break;
      case "hours":
        data.logManual(stage.id, { actorKey: null, note: what.trim() || null, quantity: Math.max(0.25, amount) });
        what = "";
        amount = 1;
        break;
      case "days":
      case "event":
        data.logManual(stage.id, { actorKey: null, note: what.trim() || null, quantity: 1 });
        what = "";
    }
  }

  const readout = $derived(gate ? gateReadout(stage.metric, gate.count, gate.threshold) : null);
</script>

<div class="space-y-3">
  <div class="flex items-baseline gap-3">
    {#if gate?.measurable}
      <span class="t-data-strong {gate.passed ? 'text-positive' : 'text-fg'}">{readout}</span>
      <span class="t-micro text-fg-faint">{formatDayKey(gate.windowStart)} – {formatDayKey(gate.windowEnd)}</span>
    {:else if gate}
      <span class="t-label flex items-center gap-1.5 text-fg-faint">
        <CircleDashed size={14} /> Not measurable yet — the window opens {formatDayKey(gate.windowStart)}.
      </span>
    {:else}
      <span class="t-label text-fg-faint">Counting…</span>
    {/if}
  </div>

  {#if manual.length > 0}
    <ul class="space-y-0.5">
      {#each manual as row (row.id)}
        <li class="t-micro flex items-center gap-2 text-fg-muted">
          <PenLine size={11} class="shrink-0 text-fg-faint" />
          <span class="tabular-nums text-fg-faint">{formatDayKey(row.day)}</span>
          <span class="min-w-0 flex-1 truncate">
            {row.actorKey ?? row.note ?? "counted"}{row.quantity !== 1 ? ` × ${row.quantity}` : ""}
          </span>
          <span class="text-fg-faint">{row.source === "manual" ? "by hand" : row.source}</span>
          {#if row.source === "manual"}
            <Button variant="bare" title="Remove entry" onclick={() => data.removeManual(row.id)}>
              {#snippet icon()}<X size={12} class="text-fg-faint" />{/snippet}
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-wrap items-center gap-2">
    {#if stage.metric === "people"}
      <input
        bind:value={who}
        placeholder="Who — a name or handle"
        aria-label="Person"
        onkeydown={(e) => e.key === "Enter" && log()}
        class="field-boxed flex-1"
      />
    {:else if stage.metric !== "event"}
      <input
        bind:value={what}
        placeholder={stage.metric === "days" ? "What happened today (optional)" : "What (optional)"}
        aria-label="Note"
        onkeydown={(e) => e.key === "Enter" && log()}
        class="field-boxed flex-1"
      />
      {#if stage.metric === "throughput" || stage.metric === "hours"}
        <input
          type="number"
          min={stage.metric === "hours" ? 0.25 : 1}
          step={stage.metric === "hours" ? 0.25 : 1}
          bind:value={amount}
          aria-label="Amount"
          class="field-boxed t-data w-20 text-right"
        />
      {/if}
    {:else}
      <input
        bind:value={what}
        placeholder="What happened (optional)"
        aria-label="Note"
        onkeydown={(e) => e.key === "Enter" && log()}
        class="field-boxed flex-1"
      />
    {/if}
    <Button
      size="sm"
      variant="outline"
      label={stage.metric === "event" ? "It happened" : stage.metric === "days" ? "Count today" : "Count by hand"}
      onclick={log}
    />
  </div>
  <p class="t-micro text-fg-faint" style="border-left:2px solid {color};padding-left:8px">
    Blocks on the calendar tagged to this project count on their own. Rows added here are for what nothing can see.
  </p>
</div>
