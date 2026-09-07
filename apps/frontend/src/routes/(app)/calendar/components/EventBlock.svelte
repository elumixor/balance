<script lang="ts">
  import { clock } from "$lib/platform/clock.svelte";
import type { Category } from "$lib/core/records";
  import { CategoryIcon, CategoryPicker } from "$lib/components";
  import { restColor } from "$lib/ui/colors";
  import { formatClock } from "$lib/ui/format";
  import { DEFAULT_ICON } from "$lib/ui/icons";
  import { store } from "$lib/core/store.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { accountEmailOf, calendarData } from "$lib/calendar/calendar-data.svelte";
  import { eventCategory } from "$lib/calendar/event-category";
  import { asGoogleAccount, meetingOf } from "$lib/calendar/meeting";
  import { practices, projects, tasks } from "$lib/core/synced.svelte";
  import { openExternal } from "$lib/desktop/open";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { Link, MapPin, Users, Video } from "lucide-svelte";

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
     * Rested on by a mouse: grown to the column and saying what the card would — the sphere and
     * the project, the whole time, where it is, the call — sized by its words rather than its
     * minutes.
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
  const meeting = $derived(expanded ? meetingOf(event) : null);
  const joinUrl = $derived(meeting?.join ? asGoogleAccount(meeting.join.url, accountEmailOf(event.calendarId)) : null);
  /** Everyone but you, since the block is on your own calendar. */
  const guests = $derived(event.attendees.filter((a) => !a.self));

  /** A link that refuses to open says so, rather than doing nothing at all. */
  async function open(url: string) {
    try {
      await openExternal(url);
    } catch (e) {
      diagnostics.report("Link", e, { title: "That link wouldn’t open" });
    }
  }

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

<div
  role="button"
  tabindex={ghost ? -1 : 0}
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
  aria-label="{label}, {formatClock(new Date(event.start))}"
  class="flex min-w-0 overflow-hidden px-1.5 text-left leading-tight @container/evt
    {expanded
    ? 'relative flex-1 flex-col justify-start gap-1 py-1'
    : oneLine
      ? 'absolute inset-0 flex-row items-center gap-1 py-0'
      : 'absolute inset-0 flex-col justify-start py-0.5'}
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

  {#if expanded}
    <span class="relative z-10 w-full t-micro text-fg {event.declined ? 'line-through' : ''}">
      {@render badge()}{label}</span
    >
    <span class="relative z-10 flex w-full flex-col gap-0.5 t-data-nano text-fg-muted/80">
      <span class="whitespace-nowrap">
        {formatClock(new Date(event.start))}–{formatClock(new Date(event.end))}
      </span>
      {#if category || purpose}
        <span class="truncate">
          {#if category}{category.name}{/if}{#if category && purpose} · {/if}{#if purpose}{purpose}{/if}
        </span>
      {/if}
      {#if meeting?.location}
        <span class="flex items-center gap-1 truncate">
          <MapPin size={10} class="shrink-0" /><span class="truncate">{meeting.location}</span>
        </span>
      {/if}
      {#if guests.length > 0}
        <span class="flex items-center gap-1 truncate">
          <Users size={10} class="shrink-0" /><span class="truncate"
            >{guests.length === 1 ? (guests[0].name ?? guests[0].email ?? "1 guest") : `${guests.length} guests`}</span
          >
        </span>
      {/if}
    </span>
    {#if meeting && (meeting.join || meeting.links.length > 0)}
      <span class="relative z-10 flex flex-wrap gap-1 pt-0.5">
        {#if meeting.join && joinUrl}
          <button
            type="button"
            class="press flex items-center gap-1 rounded-sm bg-ink px-1.5 py-0.5 t-data-nano leading-[12px] text-ink-fg"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={(e) => {
              e.stopPropagation();
              void open(joinUrl);
            }}
          >
            <Video size={10} />Join {meeting.join.label}
          </button>
        {/if}
        {#each meeting.links.slice(0, 2) as link (link.url)}
          <button
            type="button"
            class="press flex max-w-full items-center gap-1 rounded-sm bg-fg/10 px-1.5 py-0.5 t-data-nano leading-[12px] text-fg hover:bg-fg/15"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={(e) => {
              e.stopPropagation();
              void open(link.url);
            }}
          >
            <Link size={10} class="shrink-0" /><span class="truncate">{link.label}</span>
          </button>
        {/each}
      </span>
    {/if}
  {:else if oneLine}
    <span
      bind:this={titleEl}
      class="relative z-10 min-w-0 flex-1 whitespace-nowrap t-micro text-fg {event.declined ? 'line-through' : ''}"
    >
      {@render badge()}{label}</span
    >
    <span
      bind:clientWidth={timeWidth}
      class="z-10 shrink-0 t-data-nano text-fg-muted/60 {timeFits
        ? 'relative'
        : 'pointer-events-none absolute opacity-0'}">{formatClock(new Date(event.start))}</span
    >
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
