<script lang="ts">
  import { restColor } from "$lib/colors";
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import { formatClock } from "$lib/format";
  import type { CalendarEvent, Category } from "$lib/types";
  import { calendarData } from "./calendar-data.svelte";

  /**
   * A block is coloured by whichever category it mostly counts toward, so a week reads as bands
   * of where the time went before a single title is read. Unmapped time stays neutral, which is
   * the point: it's the thing the screen is asking you to fix.
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
  }: {
    event: CalendarEvent;
    categories: Map<string, Category>;
    narrow?: boolean;
    ghost?: boolean;
    flatTop?: boolean;
    flatBottom?: boolean;
  } = $props();

  const data = calendarData;

  const category = $derived.by(() => {
    const ranked = event.weights
      .map((w) => ({ weight: w.weightPercent, category: categories.get(w.categoryId) }))
      .filter((w) => w.category && !w.category.isBuffer)
      .sort((a, b) => b.weight - a.weight);
    return ranked[0]?.category ?? null;
  });
  const color = $derived(category?.color ?? restColor);
  const letter = $derived((category?.name ?? "Rest").charAt(0).toUpperCase());

  const plannable = $derived([...categories.values()].filter((c) => !c.isBuffer && !c.archived));

  const selected = $derived(data.selected?.id === event.id);
  const isPast = $derived(new Date(event.end) < new Date());

  const durationMinutes = $derived((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000);
  /** Under 45 minutes there's only room for one line: icon, title and start time together. */
  const oneLine = $derived(narrow || durationMinutes < 45);
  /** 45m gets 1 title line, 1h gets 2, 1:15+ caps at 3 — the last line always goes to the time. */
  const titleLines = $derived(durationMinutes < 60 ? 1 : durationMinutes < 75 ? 2 : 3);

  function chooseCategory(target: Category, close: () => void) {
    close();
    void data.mapEvent(event, event.mappingScope ?? "instance", {
      weights: [{ categoryId: target.id, weightPercent: 100 }],
    });
  }
</script>

{#snippet badge()}
  {#if ghost}
    <span class="mr-1 rounded-sm px-1 text-[10px] font-bold leading-none text-fg">{letter}</span>
  {:else}
    <Popover width={200}>
      {#snippet trigger(open: () => void)}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            open();
          }}
          aria-label="Change category"
          class="z-10 mr-1 rounded-sm border border-transparent px-1 text-[10px] font-bold leading-none text-fg hover:border-fg/20 hover:bg-fg/10"
          >{letter}</button
        >
      {/snippet}
      {#snippet content(close: () => void)}
        {#each plannable as c (c.id)}
          <PopoverItem label={c.name} selected={category?.id === c.id} onclick={() => chooseCategory(c, close)}>
            {#snippet icon()}
              <span class="size-2.5 shrink-0 rounded-full" style="background:{c.color}"></span>
            {/snippet}
          </PopoverItem>
        {/each}
      {/snippet}
    </Popover>
  {/if}
{/snippet}

<div
  role="button"
  tabindex={ghost ? -1 : 0}
  aria-label="{event.title}, {formatClock(new Date(event.start))}"
  class="absolute inset-0 flex min-w-0 overflow-hidden px-1.5 text-left leading-tight
    {oneLine ? 'flex-row items-center gap-1 py-0' : 'flex-col justify-start py-0.5'}
    {ghost ? 'pointer-events-none opacity-70' : 'press-fade'}"
>
  <span
    class="event-fill pointer-events-none absolute inset-x-0 top-px bottom-px border-l-2
      {flatTop ? '' : 'rounded-t-sm'} {flatBottom ? '' : 'rounded-b-sm'}
      {event.declined ? 'border-dashed opacity-50' : ''}
      {event.tentative ? 'border-dotted' : ''}
      {selected ? 'is-selected' : ''} {isPast ? 'is-past' : ''}"
    style="--c:{color};border-color:{color}"
  ></span>

  {#if oneLine}
    <span class="t-micro min-w-0 flex-1 overflow-hidden whitespace-nowrap text-fg {event.declined ? 'line-through' : ''}">
      {@render badge()}{event.title}</span
    >
    {#if !narrow}
      <span class="shrink-0 font-sans text-[10px] leading-none text-fg-muted/60"
        >{formatClock(new Date(event.start))}</span
      >
    {/if}
  {:else}
    <span
      class="t-micro w-full text-fg {event.declined ? 'line-through' : ''}"
      style="display:-webkit-box;-webkit-line-clamp:{titleLines};-webkit-box-orient:vertical;overflow:hidden"
    >
      {@render badge()}{event.title}</span
    >
    <span class="w-full shrink-0 font-sans text-[10px] leading-none text-fg-muted/60">
      {formatClock(new Date(event.start))}–{formatClock(new Date(event.end))}
    </span>
  {/if}
</div>
