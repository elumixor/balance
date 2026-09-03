<script lang="ts">
  import { clock } from "$lib/clock.svelte";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import { restColor } from "$lib/colors";
  import { formatClock } from "$lib/format";
  import { DEFAULT_ICON } from "$lib/icons";
  import { store } from "$lib/store.svelte";
  import type { CalendarEvent, Category } from "$lib/types";
  import { calendarData } from "./calendar-data.svelte";
  import CategoryPicker from "./CategoryPicker.svelte";
  import { eventCategory } from "./event-category";

  /**
   * A block is coloured by the Google calendar it lives on, so a week reads as bands of which
   * calendar an hour belongs to. The category still shows, as the letter badge.
   *
   * Purely visual except for the category badge — dragging and opening the full editor are owned
   * by whatever positions the block.
   */
  let {
    event,
    categories,
    narrow = false,
    ghost = false,
    flatTop = false,
    flatBottom = false,
    stacked = false,
  }: {
    event: CalendarEvent;
    categories: Map<string, Category>;
    narrow?: boolean;
    ghost?: boolean;
    flatTop?: boolean;
    flatBottom?: boolean;
    /** Drawn over another block, so it carries a hairline of background to lift it off the one under it. */
    stacked?: boolean;
  } = $props();

  const data = calendarData;

  const category = $derived(eventCategory(event, categories));
  const icon = $derived(category?.icon ?? DEFAULT_ICON);
  /** An hour tapped onto the grid is named afterwards, so a block with nothing on it says so. */
  const label = $derived(event.title.trim() || "Untitled");

  const calendars = $derived((store.calendars.value?.accounts ?? []).flatMap((a) => a.calendars));
  const fillColor = $derived(category?.color ?? restColor);
  const borderColor = $derived(calendars.find((c) => c.id === event.calendarId)?.color ?? restColor);

  const plannable = $derived([...categories.values()]);

  const selected = $derived(data.selected?.id === event.id);
  /** One of the blocks a box or a ⌘-click gathered, and so one a batch write is about. */
  const picked = $derived(!ghost && data.picked.has(event.id));
  const isPast = $derived(new Date(event.end) < clock.now);

  const durationMinutes = $derived((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000);
  /** Under 45 minutes there's only room for one line: icon, title and start time together. */
  const oneLine = $derived(narrow || durationMinutes < 45);
  /** 45m gets 1 title line, 1h gets 2, 1:15+ caps at 3 — the last line always goes to the time. */
  const titleLines = $derived(durationMinutes < 60 ? 1 : durationMinutes < 75 ? 2 : 3);

  /** Set to the badge's rect while the quick category pick is open, null otherwise. */
  let categoryRect = $state<DOMRect | null>(null);

  /**
   * On one line the title comes first and the start time is a bonus: it shows only when the whole
   * title already fits beside it. The time span stays in the DOM either way — taken out of the flow
   * when it can't be shown — so its width is known without a second, hidden copy to measure.
   */
  let boxWidth = $state(0);
  let timeWidth = $state(0);
  let titleEl = $state<HTMLElement | null>(null);
  let titleWidth = $state(0);
  $effect(() => {
    // Re-measure whenever the block resizes or the title changes; scrollWidth is the untruncated
    // width, so it doesn't move when the time appears next to it and can't oscillate.
    void [label, boxWidth];
    titleWidth = titleEl?.scrollWidth ?? 0;
  });
  /** px: the block's horizontal padding plus the gap between title and time. */
  const CHROME_PX = 16;
  const timeFits = $derived(boxWidth > 0 && titleWidth + timeWidth + CHROME_PX <= boxWidth);

  function chooseCategory(id: string) {
    categoryRect = null;
    const targets = data.picked.has(event.id) && data.picked.size > 1 ? data.pickedEvents : [event];
    if (targets.length > 1) void data.mapEvents(targets, [{ categoryId: id, weightPercent: 100 }]);
    else
      void data.mapEvent(event, event.seriesId ? "series" : "instance", {
        weights: [{ categoryId: id, weightPercent: 100 }],
      });
  }
</script>

{#snippet badge()}
  {#if ghost}
    <span class="-my-0.5 mr-1 inline-block align-middle">
      <CategoryIcon {icon} color={fillColor} size={14} bg={false} />
    </span>
  {:else}
    <button
      type="button"
      data-category-badge
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => {
        e.stopPropagation();
        categoryRect = e.currentTarget.getBoundingClientRect();
      }}
      aria-label="Change category"
      class="press-fade -my-0.5 z-10 mr-1 inline-block rounded-sm align-middle transition-colors hover:bg-fg/10"
    >
      <CategoryIcon {icon} color={fillColor} size={14} bg={false} />
    </button>
  {/if}
{/snippet}

<div
  role="button"
  tabindex={ghost ? -1 : 0}
  bind:clientWidth={boxWidth}
  aria-label="{label}, {formatClock(new Date(event.start))}"
  class="absolute inset-0 flex min-w-0 overflow-hidden px-1.5 text-left leading-tight @container/evt
    {oneLine ? 'flex-row items-center gap-1 py-0' : 'flex-col justify-start py-0.5'}
    {ghost ? 'pointer-events-none opacity-70' : 'press-fade'}"
>
  <span
    class="event-fill pointer-events-none absolute inset-x-0 top-px bottom-px border-l-2
      {flatTop ? '' : 'rounded-t-sm'} {flatBottom ? '' : 'rounded-b-sm'}
      {event.declined ? 'border-dashed opacity-50' : ''}
      {event.tentative ? 'border-dotted' : ''}
      {selected ? 'is-selected' : ''} {isPast ? 'is-past' : ''} {picked ? 'is-picked' : ''} {stacked ? 'is-stacked' : ''}"
    style="--c:{fillColor};border-color:{borderColor}"
  ></span>

  {#if oneLine}
    <span
      bind:this={titleEl}
      class="relative z-10 min-w-0 flex-1 whitespace-nowrap t-micro text-fg {event.declined ? 'line-through' : ''}"
    >
      {@render badge()}{label}</span
    >
    {#if !narrow}
      <span
        bind:clientWidth={timeWidth}
        class="z-10 shrink-0 t-data-nano text-fg-muted/60 {timeFits
          ? 'relative'
          : 'pointer-events-none absolute opacity-0'}">{formatClock(new Date(event.start))}</span
      >
    {/if}
  {:else}
    <span
      class="relative z-10 w-full t-micro text-fg {event.declined ? 'line-through' : ''}"
      style="max-height:{titleLines}lh;overflow:hidden"
    >
      {@render badge()}{label}</span
    >
    <span
      class="relative z-10 flex w-full shrink-0 overflow-hidden whitespace-nowrap t-data-nano text-fg-muted/60"
    >
      <span>{formatClock(new Date(event.start))}</span
      ><span class="hidden @min-[90px]/evt:inline">–{formatClock(new Date(event.end))}</span>
    </span>
  {/if}
</div>

{#if categoryRect}
  <CategoryPicker
    rect={categoryRect}
    categories={plannable}
    value={category?.id ?? ""}
    onchoose={chooseCategory}
    onclose={() => (categoryRect = null)}
  />
{/if}
