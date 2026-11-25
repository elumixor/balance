<script lang="ts">
  import { Button, Field, Segmented } from "$lib/components";
  import { ladderOf, slugOf } from "$lib/goals/draft";
  import type { GoalDraft } from "$lib/goals/types";
  import { deviceTimeZone } from "$lib/planning/zone";

  /**
   * A goal in three answers: what it is called, what it is counted in, and the ladder of numbers
   * it climbs. The key an app names it by is read off the title, so nobody is asked for a slug.
   */
  let { oncreate }: { oncreate: (draft: GoalDraft) => Promise<void> } = $props();

  let open = $state(false);
  let title = $state("");
  let metric = $state("minutes");
  let ladder = $state("10, 15, 20");
  let cadence = $state<"daily" | "weekly">("daily");
  let saving = $state(false);

  const key = $derived(slugOf(title));
  const levels = $derived(ladderOf(ladder));
  const metricOk = $derived(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(metric.trim()));
  const ready = $derived(Boolean(key) && levels !== null && metricOk);

  async function create() {
    if (!ready || !levels || saving) return;
    saving = true;
    try {
      await oncreate({
        key,
        title: title.trim(),
        kind: key,
        metric: metric.trim(),
        cadence,
        timeZone: deviceTimeZone(),
        levels,
      });
      open = false;
      title = "";
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <div class="space-y-3 rounded-md border border-line p-4">
    <div class="grid gap-3 sm:grid-cols-[1fr_9rem]">
      <label class="space-y-1">
        <span class="t-micro text-fg-faint">Name</span>
        <Field bind:value={title} placeholder="Meditation" autofocus />
      </label>
      <label class="space-y-1">
        <span class="t-micro text-fg-faint">Counted in</span>
        <Field bind:value={metric} placeholder="minutes" autocapitalize="off" />
      </label>
    </div>
    <label class="block space-y-1">
      <span class="t-micro text-fg-faint">Ladder, easiest first</span>
      <Field bind:value={ladder} placeholder="10, 15, 20" inputmode="decimal" />
    </label>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Segmented
        options={[
          { value: "daily", label: "Every day" },
          { value: "weekly", label: "Every week" },
        ]}
        value={cadence}
        onchange={(value) => (cadence = value)}
      />
      <div class="flex gap-2">
        <Button label="Cancel" variant="outline" size="sm" onclick={() => (open = false)} />
        <Button label="Add goal" size="sm" disabled={!ready} loading={saving} onclick={() => void create()} />
      </div>
    </div>
    {#if key}
      <p class="t-micro text-fg-faint">Apps post progress to it as <code>{key}</code>.</p>
    {/if}
  </div>
{:else}
  <Button label="New goal" variant="outline" size="sm" onclick={() => (open = true)} />
{/if}
