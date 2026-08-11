<script lang="ts">
  import { restColor } from "$lib/colors";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import { formatClock, formatDateInput, formatHoursAndMinutes, parseDateAndClock } from "$lib/format";
  import type { Activity, ActivityWeight, CalendarEvent, Category, MappingScope } from "$lib/types";
  import { ArrowRight, Bell, Clock, Link2, MapPin, Trash2, Video, X } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * One event, opened beside the block you tapped: what it says, when it runs, and what it counts
   * as. Nothing here has a Save button — every edit is written back a moment after the typing
   * stops, the way a calendar is expected to behave.
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

  const WIDTH = 380;
  const MARGIN = 12;
  const GAP = 8;
  /** How long after the last keystroke the edit goes to the calendar. */
  const SAVE_DELAY_MS = 700;

  const data = calendarData;
  const plannable = $derived(categories.filter((c) => !c.isBuffer));
  const editable = $derived(!event.readOnly && !event.allDay);

  // Every field below is filled in by the effect that loads the event, including the first one.
  let scope = $state<MappingScope>("instance");
  let mode = $state<"activity" | "categories">("activity");
  let mapping = $state(false);
  let search = $state("");
  let weights = $state<Record<string, number>>({});
  let title = $state("");
  let notes = $state("");
  let date = $state("");
  let from = $state("");
  let to = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  let card = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** What the calendar last agreed to, so an unchanged field never costs a write. */
  let saved = { title: "", notes: "", start: 0, end: 0 };
  let loaded = "";
  /** A deleted event must not be written back by the pending edit the card is unmounting with. */
  let deleted = false;

  // Selecting another block while this one is open swaps the prop rather than remounting.
  $effect(() => {
    if (loaded === event.id) return;
    loaded = event.id;
    scope = event.mappingScope ?? "instance";
    mode = event.activityId || !event.weights.length ? "activity" : "categories";
    mapping = false;
    search = "";
    weights = Object.fromEntries(
      plannable.map((c) => [c.id, event.weights.find((w) => w.categoryId === c.id)?.weightPercent ?? 0]),
    );
    title = event.title;
    notes = event.description ?? "";
    date = formatDateInput(new Date(event.start));
    from = formatClock(new Date(event.start));
    to = formatClock(new Date(event.end));
    error = null;
    saved = {
      title: event.title,
      notes: event.description ?? "",
      start: new Date(event.start).getTime(),
      end: new Date(event.end).getTime(),
    };
  });

  const matches = $derived(
    activities.filter((a) => !a.archived && a.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const claimed = $derived(plannable.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0));
  const countsAs = $derived(event.activityName ?? (event.weights.length > 0 ? "a split of categories" : "Add mapping"));
  const dotColor = $derived(
    categories.find((c) => c.id === event.weights[0]?.categoryId)?.color ?? (event.activityName ? restColor : null),
  );

  /** The span the two clock fields describe, shown beside them the way the calendar shows it. */
  const span = $derived.by(() => {
    const range = parseRange();
    if (!range) return "";
    return formatHoursAndMinutes((range.end.getTime() - range.start.getTime()) / 3_600_000);
  });

  const longDate = $derived(
    new Date(event.start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
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

  /** A pending edit still belongs to the user, so it's written before the card goes away. */
  $effect(() => () => flush());

  function parseRange() {
    const start = parseDateAndClock(date, from);
    let end = parseDateAndClock(date, to);
    if (!start || !end) return null;
    // A block that ends before it starts ran past midnight.
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  function queue() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void commit(), SAVE_DELAY_MS);
  }

  function flush() {
    if (!timer || deleted) return;
    clearTimeout(timer);
    timer = null;
    void commit();
  }

  /** Writes only what actually moved; an unparseable time is said once and left alone. */
  async function commit() {
    timer = null;
    if (!editable) return;
    const range = parseRange();
    if (!range) {
      error = "Check the date and times.";
      return;
    }
    if (!title.trim()) {
      error = "An event needs a title.";
      return;
    }
    const next = { title: title.trim(), notes, start: range.start.getTime(), end: range.end.getTime() };
    if (next.title === saved.title && next.notes === saved.notes && next.start === saved.start && next.end === saved.end) {
      error = null;
      return;
    }

    saving = true;
    error = null;
    try {
      await data.editEvent(event, {
        title: next.title,
        description: next.notes,
        start: range.start,
        end: range.end,
      });
      error = data.actionError;
      if (!error) saved = next;
    } finally {
      saving = false;
    }
  }

  /** Mapping writes land straight away — there's nothing to type, so there's nothing to wait for. */
  async function run(action: () => Promise<void>) {
    saving = true;
    error = null;
    try {
      await action();
      error = data.actionError;
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

  function close() {
    flush();
    data.deselect();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
    // Enter commits from any single-line field; the notes get their own newlines.
    if (e.key === "Enter" && !e.shiftKey && editable && !(e.target instanceof HTMLTextAreaElement)) flush();
  }
</script>

<svelte:window {onkeydown} />

{#snippet row(label: string, icon: typeof MapPin)}
  {@const Icon = icon}
  <!-- The rows Notion fills in for a meeting: drawn, inert, waiting on a backend. -->
  <button type="button" class="press-sm flex w-full items-center gap-3 rounded-md py-1.5 text-left" disabled>
    <Icon size={16} class="shrink-0 text-fg-faint" />
    <span class="t-body text-fg-faint">{label}</span>
  </button>
{/snippet}

<!-- The backdrop closes on any tap outside. On a phone the card is a sheet: there's no "beside". -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-40 flex items-end justify-center bg-overlay sm:block" onclick={close}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    bind:this={card}
    class="max-h-[85dvh] w-full overflow-y-auto rounded-t-lg border border-line bg-surface
      sm:absolute sm:w-[380px] sm:rounded-lg"
    style="left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;visibility:{position || !rect
      ? 'visible'
      : 'hidden'}"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header: what this is on the left, the two things you can do to it on the right. -->
    <div class="flex items-center gap-2 px-3 pt-3">
      <span class="t-label flex-1 text-fg-muted">Event</span>
      <span class="t-micro text-fg-faint" aria-live="polite">{saving ? "Saving…" : ""}</span>
      {#if editable}
        <IconButton
          label="Delete event"
          tone="plain"
          onclick={() => {
            deleted = true;
            if (timer) clearTimeout(timer);
            void run(() => data.deleteEvent(event));
          }}
        >
          <Trash2 size={15} class="text-fg-muted" />
        </IconButton>
      {/if}
      <IconButton label="Close" tone="plain" onclick={close}>
        <X size={16} class="text-fg-muted" />
      </IconButton>
    </div>

    <div class="px-3 pt-1 pb-3">
      {#if editable}
        <Field bind:value={title} oninput={queue} variant="inline" ariaLabel="Event title" class="t-heading py-1" />
      {:else}
        <h2 class="t-heading px-2 py-1">{event.title}</h2>
      {/if}
    </div>

    {#if error}<div class="px-3 pb-3"><InlineError message={error} /></div>{/if}

    <!-- When it runs. The clock owns the whole block, so the date sits under the times it belongs to. -->
    <div class="space-y-1 border-t border-line px-3 py-3">
      <div class="flex items-center gap-3">
        <Clock size={16} class="shrink-0 text-fg-faint" />
        {#if editable}
          <Field bind:value={from} oninput={queue} mono variant="inline" ariaLabel="Start time" class="w-16" />
          <ArrowRight size={14} class="shrink-0 text-fg-faint" />
          <Field bind:value={to} oninput={queue} mono variant="inline" ariaLabel="End time" class="w-16" />
        {:else}
          <span class="t-data">{event.allDay ? "All day" : `${formatClock(new Date(event.start))}`}</span>
          {#if !event.allDay}
            <ArrowRight size={14} class="shrink-0 text-fg-faint" />
            <span class="t-data">{formatClock(new Date(event.end))}</span>
          {/if}
        {/if}
        <span class="t-data-micro text-fg-muted">{span}</span>
      </div>

      <div class="flex items-center gap-3 pl-7">
        {#if editable}
          <Field bind:value={date} oninput={queue} mono variant="inline" ariaLabel="Date" class="w-32" />
        {:else}
          <span class="t-data px-2">{longDate}</span>
        {/if}
      </div>

      <div class="flex items-center gap-4 pl-9">
        <button type="button" class="t-label text-fg-faint" disabled>All-day</button>
        <button type="button" class="t-label text-fg-faint" disabled>Time zone</button>
        <button type="button" class="t-label text-fg-faint" disabled>Repeat</button>
      </div>
    </div>

    <!-- Everything a calendar event can carry that this app doesn't hold yet. -->
    <div class="border-t border-line px-3 py-2">
      {@render row("Conferencing", Video)}
      {@render row("Location", MapPin)}
    </div>

    <div class="border-t border-line px-3 py-2">
      {@render row("Add links and attachments", Link2)}
    </div>

    <div class="border-t border-line px-3 py-2">
      {#if editable}
        <Textarea
          bind:value={notes}
          oninput={queue}
          rows={2}
          placeholder="Description"
          ariaLabel="Event notes"
          class="bg-transparent px-0"
        />
      {:else if event.description}
        <p class="t-body whitespace-pre-wrap text-fg-muted">{event.description}</p>
      {:else}
        <p class="t-body text-fg-faint">Description</p>
      {/if}
    </div>

    {#if !event.countsTowardHours}
      <p class="t-micro border-t border-line px-3 py-2 text-fg-faint">
        {event.declined ? "You declined this, so it counts toward nothing." : "All-day events don't count as hours."}
      </p>
    {/if}

    <!-- What the block counts as: set once, changed far less often than its time, so folded away. -->
    <div class="space-y-2 border-t border-line px-3 py-3">
      <button
        type="button"
        class="press-sm flex w-full items-center gap-3 rounded-md py-1 text-left"
        onclick={() => (mapping = !mapping)}
      >
        <span
          class="size-4 shrink-0 rounded-sm {dotColor ? '' : 'border border-line-strong'}"
          style={dotColor ? `background:${dotColor}` : ""}
        ></span>
        <span class="t-body flex-1 truncate {event.activityName || event.weights.length ? '' : 'text-fg-faint'}"
          >{countsAs}</span
        >
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

      <div class="flex items-center gap-3 py-1">
        <Bell size={16} class="shrink-0 text-fg-faint" />
        <span class="t-body text-fg-faint">Reminders</span>
      </div>
    </div>
  </div>
</div>
