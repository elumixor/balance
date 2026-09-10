<script lang="ts">
  import { Button, Field, NumberField, ProgressBar, Select } from "$lib/components";
  import type { Practice, PracticeProgress } from "$lib/projects/types";
  import { Repeat, X } from "lucide-svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";

  /**
   * A practice is a row, not a card: it never completes, so there is nothing to open. The bar is
   * its adherence over the last four whole weeks — a retreat week at nothing is one bad week in
   * four, not a failure — and the fields beside it are the whole of what a practice is.
   */
  let { practice, progress, color }: { practice: Practice; progress: PracticeProgress | null; color: string } = $props();

  /** Grabs the name field once for a practice that was just added. */
  function focusNew(node: HTMLInputElement) {
    if (data.focusId !== practice.id) return;
    data.focusId = null;
    node.focus();
  }

  let element = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (element) focusNew(element);
  });

  const thisWeek = $derived(progress?.byWeek.at(-1) ?? 0);
</script>

<div class="flex items-center gap-3 py-2">
  <Repeat size={15} class="shrink-0 text-fg-faint" />
  <div class="min-w-0 flex-1 space-y-1">
    <div class="flex items-center gap-2">
      <Field
        bind:element
        variant="bare-sm"
        value={practice.name}
        placeholder="Practice"
        oninput={(name) => data.updatePractice(practice.id, { name })}
        ariaLabel="Practice name"
        class="min-w-0 flex-1"
      />
      <NumberField
        value={practice.targetPerWeek}
        unit=""
        size="sm"
        ariaLabel="Target per week"
        onchange={(targetPerWeek) => data.updatePractice(practice.id, { targetPerWeek })}
      />
      <Select
        width={92}
        label="Unit"
        value={practice.unit}
        options={[
          { value: "times", label: "×/wk" },
          { value: "hours", label: "h/wk" },
        ]}
        onchange={(unit) => data.updatePractice(practice.id, { unit })}
      />
    </div>
    <div class="flex items-center gap-2">
      <div class="flex-1"><ProgressBar ratio={progress?.adherence ?? 0} {color} height={3} /></div>
      <span class="t-micro w-24 shrink-0 text-right tabular-nums text-fg-faint">
        {progress ? `${Math.round(progress.adherence * 100)}% · ${thisWeek}${practice.unit === "hours" ? "h" : "×"} this wk` : "—"}
      </span>
    </div>
  </div>
  <Button variant="bare" title="Remove practice" onclick={() => data.removePractice(practice.id)}>
    {#snippet icon()}<X size={14} class="text-fg-faint" />{/snippet}
  </Button>
</div>
