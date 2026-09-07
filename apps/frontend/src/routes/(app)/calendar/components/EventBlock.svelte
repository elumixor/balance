<script lang="ts">
  import { clock } from "$lib/platform/clock.svelte";
import type { Category } from "$lib/core/records";
  import { CategoryIcon, CategoryPicker } from "$lib/components";
  import { restColor } from "$lib/ui/colors";
  import { formatClock } from "$lib/ui/format";
  import { DEFAULT_ICON } from "$lib/ui/icons";
  import { store } from "$lib/core/store.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { eventCategory } from "$lib/calendar/event-category";
  import { practices, projects, tasks } from "$lib/core/synced.svelte";

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
    ghost = false,
    flatTop = false,
    flatBottom = false,
    stacked = false,
    expanded = false,
  }: {
    event: CalendarEvent;
    categories: Map<string, Category>;
    ghost?: boolean;
    flatTop?: boolean;
    flatBottom?: boolean;
    /** Drawn over another block, so it casts a shadow to lift it off the one under it. */
    stacked?: boolean;
    /**
     * Under the mouse: slid out to the column, with a caption under it naming the sphere and what
     * the hour is for. The block's own height never moves, since the grid is minutes.
     */
    expanded?: boolean;
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

  /** What the hour is for, on top of what it counts as. */
  const purpose = $derived(
    (event.projectId && projects.all.find((p) => p.id === event.projectId)?.name) ||
      (event.practiceId && practices.all.find((p) => p.id === event.practiceId)?.name) ||
      (event.taskId && tasks.all.find((t) => t.id === event.taskId)?.title) ||
      null,
  );
  /** What it is for when that is known — "Balance app" — and the sphere's name otherwise. */
  const caption = $derived(purpose ?? category?.name ?? "");

  const selected = $derived(data.selected?.id === event.id);
  /** One of the blocks a box or a ⌘-click gathered, and so one a batch write is about. */
  const picked = $derived(!ghost && data.picked.has(event.id));
  const isPast = $derived(new Date(event.end) < clock.now);

  /**
   * The lines the block has room for, from its drawn height rather than its length: pinched in, an
   * hour holds three lines; pinched out, it holds one. The time is the line that is never given up —
   * the title takes whatever is left above it, whole lines only, and when there is no room for one
   * the two share a line: badge, the whole title, and the time only if it fits after it.
   */
  const TITLE_LINE_PX = 16.5;
  const TIME_LINE_PX = 10;
  const PADDING_PX = 4;
  let boxHeight = $state(0);
  const titleLines = $derived(Math.floor((boxHeight - PADDING_PX - TIME_LINE_PX) / TITLE_LINE_PX));
  const oneLine = $derived(titleLines < 1);

  /**
   * On one line the title comes first and the time is a bonus: it shows only when the whole title
   * already fits beside it. The time span stays in the DOM either way — taken out of the flow when
   * it can't be shown — so its width is known without a second, hidden copy to measure.
   */
  let boxWidth = $state(0);
  let timeWidth = $state(0);
  let labelEl = $state<HTMLElement | null>(null);
  let labelWidth = $state(0);
  $effect(() => {
    // Re-measure whenever the block resizes or the title changes; scrollWidth is the untruncated
    // width, so it doesn't move when the time appears next to it and can't oscillate.
    void [label, boxWidth, titleLines];
    labelWidth = labelEl?.scrollWidth ?? 0;
  });
  /** px: the badge and the gap after it, which the title carries before its first letter. */
  const BADGE_PX = 18;
  const titleWidth = $derived(labelWidth + BADGE_PX);
  /** px: the block's horizontal padding plus the gap between title and time. */
  const CHROME_PX = 16;
  const timeFits = $derived(boxWidth > 0 && titleWidth + timeWidth + CHROME_PX <= boxWidth);
  /**
   * px the one-line title runs past the block. Under the mouse it is scrolled by that much and
   * back, so a title the block cuts off can still be read without opening it.
   */
  const PADDING_X_PX = 12;
  const overflow = $derived(
    expanded && (oneLine || titleLines === 1) ? Math.max(0, titleWidth - (boxWidth - PADDING_X_PX)) : 0,
  );
  /** Slow enough to read: about 40px a second, and never a blink. */
  const marqueeSeconds = $derived(Math.max(2, overflow / 40 + 1));

  /** Set to the badge's rect while the quick category pick is open, null otherwise. */
  let categoryRect = $state<DOMRect | null>(null);

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

<!-- The badge stays put — it is a button — and only the words slide under the mouse, clipped
     at the badge's edge so they never pass under it. -->
{#snippet titleRow()}
  {@render badge()}
  <span class="min-w-0 flex-1 overflow-hidden whitespace-nowrap {overflow > 0 ? '' : 'text-ellipsis'}">
    <span
      bind:this={labelEl}
      class="inline-block whitespace-nowrap align-top {overflow > 0 ? 'marquee' : ''}"
      style={overflow > 0 ? `--shift:-${overflow}px;animation-duration:${marqueeSeconds}s` : ""}>{label}</span
    >
  </span>
{/snippet}

<div
  role="button"
  tabindex={ghost ? -1 : 0}
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
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
      {selected ? 'is-selected' : ''} {isPast ? 'is-past' : ''} {picked ? 'is-picked' : ''} {stacked ? 'is-stacked' : ''} {expanded
        ? 'is-expanded'
        : ''}"
    style="--c:{fillColor};border-color:{borderColor}"
  ></span>

  {#if oneLine}
    <span class="relative z-10 flex min-w-0 flex-1 items-center t-micro text-fg {event.declined ? 'line-through' : ''}">
      {@render titleRow()}
    </span>
    <span
      bind:clientWidth={timeWidth}
      class="z-10 shrink-0 t-data-nano text-fg-muted/60 {timeFits
        ? 'relative'
        : 'pointer-events-none absolute opacity-0'}">{formatClock(new Date(event.start))}</span
    >
  {:else if titleLines === 1}
    <!-- One line of title: kept on it. Let wrap, a word that doesn't fit beside the badge went to
         a second line the block then clipped, leaving a badge and a time with no name. -->
    <span class="relative z-10 flex w-full items-center t-micro text-fg {event.declined ? 'line-through' : ''}">
      {@render titleRow()}
    </span>
  {:else}
    <span
      class="relative z-10 w-full t-micro text-fg {event.declined ? 'line-through' : ''}"
      style="max-height:{titleLines}lh;overflow:hidden"
    >
      {@render badge()}{label}</span
    >
  {/if}
  {#if !oneLine}
    <span
      class="relative z-10 flex w-full shrink-0 overflow-hidden whitespace-nowrap t-data-nano text-fg-muted/60"
    >
      <span>{formatClock(new Date(event.start))}</span
      ><span class="hidden @min-[90px]/evt:inline">–{formatClock(new Date(event.end))}</span>
    </span>
  {/if}
</div>

{#if expanded && caption}
  <!-- A line under the block in the sphere's own colour, haloed in the page's own colour so it
       reads over whatever event sits beneath it. -->
  <span
    class="caption-in pointer-events-none absolute top-full left-0 z-10 mt-0.5 flex max-w-full items-center gap-1 px-1.5 py-0.5 t-micro leading-[14px] font-semibold"
    style="color:{fillColor};text-shadow:0 0 2px var(--bg),0 0 4px var(--bg),0 0 8px var(--bg),0 1px 2px var(--bg);filter:drop-shadow(0 0 2px var(--bg))"
  >
    <CategoryIcon {icon} color={fillColor} size={12} bg={false} />
    <span class="truncate">{caption}</span>
  </span>
{/if}

{#if categoryRect}
  <CategoryPicker
    rect={categoryRect}
    categories={plannable}
    value={category?.id ?? ""}
    onchoose={chooseCategory}
    onclose={() => (categoryRect = null)}
  />
{/if}
