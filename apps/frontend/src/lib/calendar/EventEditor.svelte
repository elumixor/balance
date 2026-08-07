<script lang="ts">
  import { restColor } from "$lib/colors";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LabelledField from "$lib/components/LabelledField.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import { formatClock, formatDateInput, parseDateAndClock } from "$lib/format";
  import type { Activity, ActivityWeight, CalendarEvent, Category, MappingScope } from "$lib/types";
  import { Trash2, X } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * One event, opened beside the block you tapped: what it says, when it runs, and what it counts
   * as. The three fields you actually change — title, time, notes — are the card; everything about
   * mapping stays folded away until asked for, because most taps are "that ran late", not "that
   * was really admin".
   */
  let {
    event,
    rect,
    activities,
    categories,
  }: {
    event: CalendarEvent;
    rect: DOMRect | null;
    activities: readonly Activity[];
    categories: readonly Category[];
  } = $props();

  const WIDTH = 320;
  const MARGIN = 12;
  const GAP = 8;

  const data = calendarData;
  const plannable = $derived(categories.filter((c) => !c.isBuffer));
  const editable = $derived(!event.readOnly && !event.allDay);

  let scope = $state<MappingScope>(event.mappingScope ?? "instance");
  let mode = $state<"activity" | "categories">(event.activityId || !event.weights.length ? "activity" : "categories");
  let mapping = $state(false);
  let search = $state("");
  let weights = $state<Record<string, number>>(
    Object.fromEntries(plannable.map((c) => [c.id, event.weights.find((w) => w.categoryId === c.id)?.weightPercent ?? 0])),
  );
  let title = $state(event.title);
  let notes = $state(event.description ?? "");
  let date = $state(formatDateInput(new Date(event.start)));
  let from = $state(formatClock(new Date(event.start)));
  let to = $state(formatClock(new Date(event.end)));
  let saving = $state(false);
  let error = $state<string | null>(null);

  let card = $state<HTMLElement>();

  const matches = $derived(
    activities.filter((a) => !a.archived && a.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const claimed = $derived(plannable.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0));
  const countsAs = $derived(
    event.activityName ?? (event.weights.length > 0 ? "a split of categories" : "nothing yet"),
  );

  /**
   * Beside the block if there's room on either side of it, otherwise clamped into the viewport.
   * Measured only once the card exists, so it never flashes in the corner first.
   */
  let position = $state<{ left: number; top: number } | null>(null);
  $effect(() => {
    // Re-measured whenever the card can have grown: unfolding the mapping doubles its height.
    void mapping;
    void mode;
    void error;
    if (!card || !rect) return;
    const height = card.offsetHeight;
    const right = rect.right + GAP;
    const left = right + WIDTH <= window.innerWidth - MARGIN ? right : rect.left - GAP - WIDTH;

    position = {
      left: Math.min(Math.max(MARGIN, left), window.innerWidth - WIDTH - MARGIN),
      top: Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, window.innerHeight - MARGIN - height)),
    };
  });

  async function run(action: () => Promise<void>) {
    saving = true;
    error = null;
    try {
      await action();
      error = data.actionError;
      if (!error) data.deselect();
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

  function save() {
    const start = parseDateAndClock(date, from);
    let end = parseDateAndClock(date, to);
    if (!start || !end) {
      error = "Check the date and times.";
      return;
    }
    // A block that ends before it starts ran past midnight.
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    if (!title.trim()) {
      error = "An event needs a title.";
      return;
    }
    void run(() =>
      data.editEvent(event, {
        title: title.trim(),
        description: notes,
        start,
        end,
      }),
    );
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") data.deselect();
    // Enter saves from any single-line field; the notes get their own newlines.
    if (e.key === "Enter" && !e.shiftKey && editable && !(e.target instanceof HTMLTextAreaElement)) save();
  }
</script>

<svelte:window {onkeydown} />

<!-- The backdrop closes on any tap outside. On a phone the card is a sheet: there's no "beside". -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-40 flex items-end justify-center bg-overlay sm:block" onclick={() => data.deselect()}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    bind:this={card}
    class="max-h-[85dvh] w-full space-y-3 overflow-y-auto rounded-t-lg border border-line bg-surface p-4
      sm:absolute sm:w-80 sm:rounded-lg"
    style="left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;visibility:{position || !rect
      ? 'visible'
      : 'hidden'}"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-start gap-2">
      {#if editable}
        <Field bind:value={title} variant="inline" ariaLabel="Event title" class="t-body-strong py-1" />
      {:else}
        <h2 class="t-body-strong flex-1 py-1">{event.title}</h2>
      {/if}
      <IconButton label="Close" tone="plain" onclick={() => data.deselect()}>
        <X size={16} />
      </IconButton>
    </div>

    {#if error}<InlineError message={error} />{/if}

    {#if editable}
      <div class="flex gap-2">
        <LabelledField label="Date" class="flex-1">
          <Field bind:value={date} mono ariaLabel="Date" />
        </LabelledField>
        <LabelledField label="From">
          <Field bind:value={from} mono align="center" ariaLabel="Start time" class="w-16" />
        </LabelledField>
        <LabelledField label="To">
          <Field bind:value={to} mono align="center" ariaLabel="End time" class="w-16" />
        </LabelledField>
      </div>

      <LabelledField label="Notes">
        <Textarea bind:value={notes} rows={3} placeholder="Anything worth remembering" ariaLabel="Event notes" />
      </LabelledField>
    {:else}
      <p class="t-label text-fg-muted">
        {new Date(event.start).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        · {event.allDay ? "all day" : `${formatClock(new Date(event.start))}–${formatClock(new Date(event.end))}`}
      </p>
      {#if event.description}
        <p class="t-body whitespace-pre-wrap text-fg-muted">{event.description}</p>
      {/if}
    {/if}

    {#if !event.countsTowardHours}
      <p class="t-micro text-fg-faint">
        {event.declined ? "You declined this, so it counts toward nothing." : "All-day events don't count as hours."}
      </p>
    {/if}

    <Divider />

    <!-- Folded by default: what a block counts as is set once, and changed far less often than time. -->
    <button type="button" class="press-sm flex w-full items-center justify-between gap-2 rounded-md py-1 text-left"
      onclick={() => (mapping = !mapping)}
    >
      <span class="t-label text-fg-muted">Counts as</span>
      <span class="t-label truncate {event.activityName || event.weights.length ? '' : 'text-fg-faint'}">{countsAs}</span>
    </button>

    {#if mapping}
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
          { value: "activity", label: "An activity" },
          { value: "categories", label: "Categories" },
        ]}
        value={mode}
        onchange={(next) => (mode = next)}
      />

      {#if mode === "activity"}
        <Field bind:value={search} placeholder="Search activities" ariaLabel="Search activities" />
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
        <Button
          label="Doesn't count as anything"
          variant="outline"
          size="sm"
          full
          onclick={() => void run(() => data.unmapEvent(event))}
        />
      {/if}
    {/if}

    {#if editable}
      <div class="flex items-center gap-2">
        <Button label="Save" size="sm" full onclick={save} loading={saving} class="flex-1" />
        <IconButton label="Delete event" onclick={() => void run(() => data.deleteEvent(event))}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    {/if}
  </div>
</div>
