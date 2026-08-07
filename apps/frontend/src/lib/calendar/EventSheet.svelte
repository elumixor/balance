<script lang="ts">
  import { restColor } from "$lib/colors";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import Field from "$lib/components/Field.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LabelledField from "$lib/components/LabelledField.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import { formatClock, formatDateInput, parseDateAndClock } from "$lib/format";
  import type { Activity, ActivityWeight, CalendarEvent, Category, MappingScope } from "$lib/types";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * What one event counts as. Normally that's an activity; the "categories" mode is the exception
   * for a one-off that no template describes.
   */
  let {
    event,
    activities,
    categories,
  }: { event: CalendarEvent; activities: readonly Activity[]; categories: readonly Category[] } = $props();

  const data = calendarData;
  const plannable = $derived(categories.filter((c) => !c.isBuffer));

  let scope = $state<MappingScope>(event.mappingScope ?? "instance");
  let mode = $state<"activity" | "categories">(event.activityId || !event.weights.length ? "activity" : "categories");
  let search = $state("");
  let weights = $state<Record<string, number>>(
    Object.fromEntries(plannable.map((c) => [c.id, event.weights.find((w) => w.categoryId === c.id)?.weightPercent ?? 0])),
  );
  let title = $state(event.title);
  let date = $state(formatDateInput(new Date(event.start)));
  let from = $state(formatClock(new Date(event.start)));
  let to = $state(formatClock(new Date(event.end)));
  let saving = $state(false);
  let error = $state<string | null>(null);

  const matches = $derived(
    activities.filter((a) => !a.archived && a.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const claimed = $derived(plannable.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0));

  async function run(action: () => Promise<void>) {
    saving = true;
    error = null;
    try {
      await action();
      error = data.actionError;
      if (!error) data.selected = null;
    } finally {
      saving = false;
    }
  }

  const chooseActivity = (activity: Activity) => run(() => data.mapEvent(event, scope, { activityId: activity.id }));

  function saveWeights() {
    if (claimed > 100) {
      error = "That's more than one hour's worth.";
      return;
    }
    const chosen: ActivityWeight[] = plannable
      .filter((c) => (weights[c.id] ?? 0) > 0)
      .map((c) => ({ categoryId: c.id, weightPercent: Math.round(weights[c.id]) }));
    void run(() => data.mapEvent(event, scope, { weights: chosen }));
  }

  function saveTiming() {
    const start = parseDateAndClock(date, from);
    let end = parseDateAndClock(date, to);
    if (!start || !end) {
      error = "Check the date and times.";
      return;
    }
    // A block that ends before it starts ran past midnight.
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    void run(async () => {
      if (title.trim() && title !== event.title) await data.renameEvent(event, title.trim());
      await data.retimeEvent(event, start, end);
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-40 flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-6" onclick={() => (data.selected = null)}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="max-h-[85dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-lg border border-line bg-surface p-5 sm:rounded-lg"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="space-y-1">
      <h2 class="t-heading">{event.title}</h2>
      <p class="t-label text-fg-muted">
        {new Date(event.start).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        · {event.allDay ? "all day" : `${formatClock(new Date(event.start))}–${formatClock(new Date(event.end))}`}
      </p>
      {#if !event.countsTowardHours}
        <p class="t-micro text-fg-faint">
          {event.declined ? "You declined this, so it counts toward nothing." : "All-day events don't count as hours."}
        </p>
      {/if}
    </div>

    {#if error}<InlineError message={error} />{/if}

    {#if event.seriesId}
      <Segmented
        options={[
          { value: "instance", label: "This event" },
          { value: "series", label: "Every repeat" },
        ]}
        value={scope}
        onchange={(next) => (scope = next)}
      />
    {/if}

    <Segmented
      options={[
        { value: "activity", label: "As an activity" },
        { value: "categories", label: "Straight to categories" },
      ]}
      value={mode}
      onchange={(next) => (mode = next)}
    />

    {#if mode === "activity"}
      <LabelledField label="Counts as">
        <Field bind:value={search} placeholder="Search activities" ariaLabel="Search activities" />
      </LabelledField>
      <div class="flex flex-wrap gap-2">
        {#each matches as activity (activity.id)}
          <Chip
            label={activity.name}
            selected={activity.id === event.activityId}
            onclick={() => void chooseActivity(activity)}
          />
        {/each}
      </div>
    {:else}
      <div class="space-y-2">
        {#each plannable as category (category.id)}
          <div class="flex items-center justify-between gap-3">
            <span class="t-label flex items-center gap-2 truncate">
              <span class="size-2 shrink-0 rounded-full" style="background:{category.color}"></span>
              {category.name}
            </span>
            <NumberField
              value={weights[category.id] ?? 0}
              unit="%"
              ariaLabel="{category.name} share"
              onchange={(next) => (weights = { ...weights, [category.id]: Math.max(0, Math.round(next)) })}
            />
          </div>
        {/each}
        <div class="flex items-center justify-between gap-3">
          <span class="t-label flex items-center gap-2 text-fg-muted">
            <span class="size-2 shrink-0 rounded-full" style="background:{restColor}"></span>
            Rest + Buffer
          </span>
          <span class="t-data-micro text-fg-muted">{Math.max(0, 100 - claimed)}%</span>
        </div>
        <Button label="Save split" size="sm" onclick={saveWeights} loading={saving} />
      </div>
    {/if}

    {#if event.mappingScope}
      <Button label="Doesn't count as anything" variant="outline" size="sm" onclick={() => void run(() => data.unmapEvent(event))} />
    {/if}

    {#if !event.readOnly && !event.allDay}
      <Divider />
      <div class="space-y-3">
        <LabelledField label="Title">
          <Field bind:value={title} ariaLabel="Event title" />
        </LabelledField>
        <div class="flex gap-2">
          <LabelledField label="Date" class="flex-1">
            <Field bind:value={date} mono ariaLabel="Date" />
          </LabelledField>
          <LabelledField label="From">
            <Field bind:value={from} mono align="center" ariaLabel="Start time" class="w-20" />
          </LabelledField>
          <LabelledField label="To">
            <Field bind:value={to} mono align="center" ariaLabel="End time" class="w-20" />
          </LabelledField>
        </div>
        <div class="flex gap-2">
          <Button label="Save changes" size="sm" onclick={saveTiming} loading={saving} />
          <Button label="Delete" variant="danger" size="sm" onclick={() => void run(() => data.deleteEvent(event))} />
        </div>
      </div>
    {/if}

    <Button label="Close" variant="outline" size="sm" full onclick={() => (data.selected = null)} />
  </div>
</div>
