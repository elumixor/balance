<script lang="ts">
  import { restColor, withAlpha } from "$lib/colors";
  import { formatClock } from "$lib/format";
  import type { CalendarEvent, Category } from "$lib/types";

  /**
   * A block is coloured by whichever category it mostly counts toward, so a week reads as bands
   * of where the time went before a single title is read. Unmapped time stays neutral, which is
   * the point: it's the thing the screen is asking you to fix.
   *
   * Purely visual — dragging is owned by whatever positions the block.
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

  const color = $derived.by(() => {
    const ranked = event.weights
      .map((w) => ({ weight: w.weightPercent, category: categories.get(w.categoryId) }))
      .filter((w) => w.category && !w.category.isBuffer)
      .sort((a, b) => b.weight - a.weight);
    return ranked[0]?.category?.color ?? restColor;
  });

  const caption = $derived(
    event.weights.length === 0 ? "unmapped" : (event.activityName ?? formatClock(new Date(event.start))),
  );
</script>

<button
  type="button"
  aria-label="{event.title}, {formatClock(new Date(event.start))}"
  disabled={ghost}
  class="absolute inset-0 flex min-w-0 flex-col items-start overflow-hidden border-l-2 px-1.5 py-0.5 text-left
    {ghost ? 'pointer-events-none opacity-70' : 'press-sm'}
    {flatTop ? '' : 'rounded-t-sm'} {flatBottom ? '' : 'rounded-b-sm'}
    {event.declined ? 'border-dashed opacity-50' : ''}
    {event.tentative ? 'border-dotted' : ''}"
  style="background:{withAlpha(color, 0.16)};border-color:{color}"
>
  <span class="t-micro w-full truncate {event.declined ? 'line-through' : ''}">{event.title}</span>
  {#if !narrow}
    <span class="t-data-micro w-full truncate text-fg-faint">{caption}</span>
  {/if}
</button>
