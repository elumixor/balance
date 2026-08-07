<script lang="ts">
  import Chip from "$lib/components/Chip.svelte";
  import Field from "$lib/components/Field.svelte";
  import FormActions from "$lib/components/FormActions.svelte";
  import LabelledField from "$lib/components/LabelledField.svelte";
  import { formatClock, formatDateInput, formatHoursAndMinutes, parseDateAndClock } from "$lib/format";
  import type { Activity, Entry } from "$lib/types";
  import type { EntryDraft } from "./track-data.svelte";

  const NUDGES = [-15, -5, 5, 15];

  /**
   * Entries are edited where they live, in the list. Times are two plain fields —
   * a date and a clock — plus nudges, which is faster than a picker for the small
   * corrections people actually make.
   */
  let {
    entry,
    activities,
    oncancel,
    onsave,
  }: {
    entry: Entry | null;
    activities: Activity[];
    oncancel: () => void;
    onsave: (draft: EntryDraft) => Promise<void>;
  } = $props();

  const start = entry ? new Date(entry.startedAt) : new Date(Date.now() - 30 * 60 * 1000);
  const end = entry?.endedAt ? new Date(entry.endedAt) : new Date();

  let activityId = $state(entry?.activityId ?? activities[0]?.id ?? "");
  let date = $state(formatDateInput(start));
  let startClock = $state(formatClock(start));
  let endClock = $state(formatClock(end));
  let note = $state(entry?.note ?? "");
  let error = $state<string | null>(null);
  let saving = $state(false);

  const range = $derived.by(() => {
    const from = parseDateAndClock(date, startClock);
    const to = parseDateAndClock(date, endClock);
    if (!from || !to) return null;
    // A range that ends before it starts ran past midnight.
    if (to <= from) to.setDate(to.getDate() + 1);
    return { from, to };
  });

  function nudgeEnd(minutes: number) {
    const to = parseDateAndClock(date, endClock);
    if (!to) return;
    to.setMinutes(to.getMinutes() + minutes);
    endClock = formatClock(to);
  }

  async function submit() {
    if (!activityId) return (error = "Pick an activity");
    if (!range) return (error = "Use YYYY-MM-DD and HH:MM");
    saving = true;
    error = null;
    try {
      await onsave({
        activityId,
        startedAt: range.from.toISOString(),
        endedAt: range.to.toISOString(),
        note: note.trim() || null,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save this entry";
      saving = false;
    }
  }
</script>

<div class="space-y-4 py-3">
  <LabelledField label="Activity">
    <div class="flex flex-wrap gap-1.5">
      {#each activities as activity (activity.id)}
        <Chip label={activity.name} selected={activity.id === activityId} onclick={() => (activityId = activity.id)} />
      {/each}
    </div>
  </LabelledField>

  <div class="flex gap-2">
    <LabelledField label="Date" class="flex-[1.4]">
      <Field bind:value={date} mono placeholder="2026-01-31" />
    </LabelledField>
    <LabelledField label="From" class="flex-1">
      <Field bind:value={startClock} mono align="center" placeholder="09:00" />
    </LabelledField>
    <LabelledField label="To" class="flex-1">
      <Field bind:value={endClock} mono align="center" placeholder="10:30" />
    </LabelledField>
  </div>

  <div class="flex items-center gap-1">
    {#each NUDGES as minutes (minutes)}
      <button
        type="button"
        onclick={() => nudgeEnd(minutes)}
        aria-label="Change end time by {minutes} minutes"
        class="t-data-micro rounded-sm border border-line px-2.5 py-1 text-fg-muted"
      >
        {minutes > 0 ? `+${minutes}` : minutes}
      </button>
    {/each}
    <span class="t-data-micro ml-auto {range ? 'text-fg-muted' : 'text-danger'}">
      {range ? formatHoursAndMinutes((range.to.getTime() - range.from.getTime()) / 3_600_000) : "—"}
    </span>
  </div>

  <LabelledField label="Note">
    <Field bind:value={note} placeholder="Optional" autocapitalize="sentences" />
  </LabelledField>

  {#if error}
    <p class="t-label text-danger">{error}</p>
  {/if}

  <FormActions {oncancel} onsave={submit} {saving} />
</div>
