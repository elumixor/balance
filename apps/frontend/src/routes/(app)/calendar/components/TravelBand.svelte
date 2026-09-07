<script lang="ts">
  import { preferences } from "$lib/account/preferences.svelte";
  import type { TravelMode } from "$lib/account/preferences-types";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { eventCategory } from "$lib/calendar/event-category";
  import { type PlacedSegment, travelBandBox } from "$lib/calendar/week-grid";
  import type { Category } from "$lib/core/records";
  import { openExternal } from "$lib/desktop/open";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { travelTimes } from "$lib/travel/times.svelte";
  import { restColor, withAlpha } from "$lib/ui/colors";
  import { formatHoursAndMinutes } from "$lib/ui/format";
  import { Bike, Bus, Car, Footprints } from "lucide-svelte";

  /**
   * The band drawn above a block for the journey to it — the time it takes to get there, hatched
   * in the block's own colour, so it reads as time that is spoken for without being an event.
   * Tapping it opens the route in Maps. Nothing is drawn while the journey is unknown or too short
   * to see.
   */
  let {
    segment,
    categories,
    hourPx,
    inWindow,
    left = segment.left,
    width = segment.width,
    z = segment.depth,
    onenter,
    onleave,
  }: {
    segment: PlacedSegment;
    categories: Map<string, Category>;
    hourPx: number;
    /** Only a column the window is over asks about its journeys: the runway either side would be
     *  requests for a week nobody is looking at. */
    inWindow: boolean;
    /** Where the block is drawn right now — it slides out under the mouse, and the band goes with it. */
    left?: number;
    width?: number;
    z?: number;
    /** The band is part of the block to the mouse: resting on it slides the block out too. */
    onenter?: (e: PointerEvent) => void;
    onleave?: () => void;
  } = $props();

  /** The glyph of each way of going, the same ones the card's chips wear. */
  const MODE_ICONS: Record<TravelMode, typeof Bus> = { transit: Bus, drive: Car, bicycle: Bike, walk: Footprints };

  // Asked once per event: `travelTimes` remembers the answer for the session.
  $effect(() => {
    if (inWindow && !segment.continuesBefore) travelTimes.ensure(segment.event, calendarData.events);
  });

  const journey = $derived(
    segment.continuesBefore ? null : travelTimes.journeyFor(segment.event, calendarData.events),
  );
  const band = $derived.by(() => {
    if (!journey) return null;
    const minutes = journey.seconds / 60 + preferences.travel.bufferMinutes;
    return travelBandBox(segment, minutes, hourPx);
  });
  const color = $derived(eventCategory(segment.event, categories)?.color ?? restColor);

  /** A route that refuses to open says so on a card, rather than doing nothing at all. */
  async function openRoute(url: string) {
    try {
      await openExternal(url);
    } catch (e) {
      diagnostics.report("Travel", e, { title: "That route wouldn’t open" });
    }
  }
</script>

{#if journey && band}
  {@const Mode = MODE_ICONS[journey.mode]}
  <div
    role="link"
    tabindex="-1"
    aria-label="Open the {journey.mode} route in Maps"
    class="event-slot press-fade absolute cursor-pointer overflow-hidden rounded-t-sm border border-b-0 border-dashed"
    onpointerenter={onenter}
    onpointerleave={onleave}
    onclick={(e) => {
      e.stopPropagation();
      void openRoute(journey.url);
    }}
    onkeydown={(e) => e.key === "Enter" && void openRoute(journey.url)}
    onpointerdown={(e) => e.stopPropagation()}
    style="top:{band.top}px;height:{band.height}px;left:{left}px;width:{width}px;z-index:{z};border-color:{withAlpha(
      color,
      0.45,
    )};background:repeating-linear-gradient(135deg,{withAlpha(color, 0.16)} 0 3px,transparent 3px 8px)"
  >
    {#if band.labelled}
      <span
        class="t-micro absolute inset-x-0 top-0 flex items-start gap-1 overflow-hidden px-1.5 py-0.5 text-fg-muted"
        style="max-height:{band.visible}px"
      >
        <Mode size={11} class="mt-0.5 shrink-0" />
        <span class="min-w-0 break-words">{formatHoursAndMinutes(journey.seconds / 3600)}</span>
      </span>
    {/if}
  </div>
{/if}
