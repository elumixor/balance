<script lang="ts">
  import { restColor } from "$lib/colors";
  import Button from "$lib/components/Button.svelte";
  import Dot from "$lib/components/Dot.svelte";
  import Field from "$lib/components/Field.svelte";
  import LabelledField from "$lib/components/LabelledField.svelte";
  import WeekRing from "$lib/components/ring/WeekRing.svelte";
  import type { Activity, Category, RingSegment } from "$lib/types";
  import type { ActivityDraft } from "./activities-data.svelte";

  /**
   * An activity is a recipe: one hour of it feeds several categories. The ring is
   * that hour, and the leftover is time the activity doesn't claim for anything.
   */
  let {
    activity,
    categories,
    oncancel,
    onsave,
  }: {
    activity: Activity | null;
    categories: Category[];
    oncancel: () => void;
    onsave: (draft: ActivityDraft) => Promise<void>;
  } = $props();

  let name = $state(activity?.name ?? "");
  let weights = $state<Record<string, number>>(
    (() => {
      const initial: Record<string, number> = {};
      for (const category of categories) initial[category.id] = 0;
      for (const weight of activity?.weights ?? []) {
        if (weight.categoryId in initial) initial[weight.categoryId] = weight.weightPercent;
      }
      return initial;
    })(),
  );
  let error = $state<string | null>(null);
  let saving = $state(false);

  const claimed = $derived(categories.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0));
  const free = $derived(Math.max(0, 100 - claimed));

  const segments = $derived<RingSegment[]>([
    ...categories.map((c) => ({ id: c.id, label: c.name, color: c.color, value: weights[c.id] ?? 0 })),
    { id: "__free__", label: "Unclaimed", color: restColor, value: free },
  ]);

  function setWeightsFromRing(values: number[]) {
    const next: Record<string, number> = {};
    categories.forEach((c, i) => {
      next[c.id] = Math.round(values[i] ?? weights[c.id] ?? 0);
    });
    weights = next;
  }

  function setWeight(categoryId: string, value: string) {
    const number = Number(value);
    if (Number.isNaN(number)) return;
    weights = { ...weights, [categoryId]: Math.max(0, Math.round(number)) };
  }

  async function submit() {
    if (!name.trim()) return (error = "Give it a name");
    if (claimed > 100) return (error = "Shares add up to more than one hour");
    saving = true;
    error = null;
    try {
      await onsave({
        name: name.trim(),
        weights: categories
          .map((c) => ({ categoryId: c.id, weightPercent: Math.round(weights[c.id] ?? 0) }))
          .filter((w) => w.weightPercent > 0),
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save this activity";
      saving = false;
    }
  }
</script>

<div class="space-y-4 py-3">
  <LabelledField label="Name">
    <Field bind:value={name} placeholder="Activity name" autocapitalize="sentences" />
  </LabelledField>

  {#if categories.length === 0}
    <p class="t-label text-fg-muted">Plan at least one category on the Week tab first.</p>
  {:else}
    <div class="flex justify-center">
      <WeekRing
        {segments}
        onchange={setWeightsFromRing}
        size={188}
        thickness={22}
        unit="%"
        centerValue="{Math.round(claimed)}%"
        centerLabel="of an hour claimed"
      />
    </div>

    <div class="space-y-2">
      {#each categories as category (category.id)}
        <div class="flex items-center gap-2">
          <Dot color={category.color} size={9} />
          <span class="t-body flex-1 truncate">{category.name}</span>
          <span class="flex items-center">
            <Field
              variant="inline"
              mono
              align="right"
              inputmode="numeric"
              ariaLabel="{category.name} share"
              value={String(weights[category.id] ?? 0)}
              oninput={(value) => setWeight(category.id, value)}
              class="w-11"
            />
            <span class="t-data text-fg-faint">%</span>
          </span>
        </div>
      {/each}
      {#if free > 0}
        <p class="t-micro text-fg-faint">{free}% stays unclaimed — time that counts as your own.</p>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="t-label text-danger">{error}</p>
  {/if}

  <div class="flex gap-2">
    <Button label="Cancel" variant="outline" onclick={oncancel} class="flex-1" />
    <Button label="Save" onclick={submit} loading={saving} disabled={categories.length === 0} class="flex-1" />
  </div>
</div>
