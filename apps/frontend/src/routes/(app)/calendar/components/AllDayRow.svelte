<script lang="ts" module>
  /** The day headings' height, and the height of each row of banners and markers under them. */
  export const DAY_HEAD_PX = 28;
  export const ALL_DAY_PX = 28;
</script>

<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { DayMarker } from "$lib/calendar/markers";
  import { type AllDaySpan, BLOCK_GUTTER_PX, drawnBounds, spanInWindow, type StripWindow } from "$lib/calendar/week-grid";
  import type { Category } from "$lib/core/records";
  import { Flag } from "lucide-svelte";
  import type { TransitionConfig } from "svelte/transition";
  import EventBlock from "./EventBlock.svelte";

  /**
   * The rows under the day headings: the projects' days on the strip — a decision day as a flag,
   * a checkpoint as a tick — and then the all-day banners, each spanning the whole columns it
   * covers. Rows are reserved for the whole strip, so a banner keeps its row as it scrolls in, but
   * only the ones near the window are built, the same way the blocks below them are.
   */
  let {
    days,
    columns,
    spans,
    markers,
    rows,
    markerRows,
    folded,
    onunfold,
    window,
    seen,
    appear,
    categories,
  }: {
    days: readonly Date[];
    /** The strip's `grid-template-columns`, shared with the headings and the hours below. */
    columns: string;
    spans: readonly AllDaySpan[];
    markers: readonly DayMarker[];
    /** How many rows of banners the days on screen need. */
    rows: number;
    /** How many rows of project days the days on screen need. */
    markerRows: number;
    /** Folded, each day's counts by strip index, said in one row in place of the rows themselves. */
    folded: { events: readonly number[]; tasks: readonly number[] } | null;
    onunfold: () => void;
    window: StripWindow;
    seen: ReadonlySet<string>;
    appear: (node: Element, params: { id: string }) => TransitionConfig;
    categories: Map<string, Category>;
  } = $props();

  const data = calendarData;

  const drawn = $derived(drawnBounds(window));
  const drawnSpans = $derived(
    spans.filter(
      (span) =>
        span.dayIndex + span.days > drawn.first &&
        span.dayIndex <= drawn.last &&
        // Same rule as the blocks below: a banner nobody has seen waits for the window rather than
        // spending its fade on the runway.
        (seen.has(span.event.id) || spanInWindow(span.dayIndex, span.days, window)),
    ),
  );
  const drawnMarkers = $derived(markers.filter((m) => m.dayIndex + m.days > drawn.first && m.dayIndex <= drawn.last));

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

  /** "2 events · 3 tasks" — what a folded day holds, or nothing for a day that holds nothing. */
  function summary(index: number) {
    if (!folded) return "";
    const events = folded.events[index] ?? 0;
    const tasks = folded.tasks[index] ?? 0;
    return [events ? plural(events, "event") : "", tasks ? plural(tasks, "task") : ""].filter(Boolean).join(" · ");
  }

  /** Enter or Space on a focused banner does what a tap does. */
  function onkeydown(e: KeyboardEvent & { currentTarget: HTMLElement }, span: AllDaySpan) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    data.tap(span.event, e.currentTarget.getBoundingClientRect(), e.metaKey || e.ctrlKey);
  }
</script>

{#if folded}
  <div class="grid" style="grid-template-columns:{columns};height:{ALL_DAY_PX}px">
    {#each days as _, index}
      {@const said = summary(index)}
      <div class="flex min-w-0 items-center border-line border-l px-0.5">
        {#if said}
          <button
            type="button"
            onclick={onunfold}
            class="hoverable t-micro w-full truncate rounded-sm px-1 py-0.5 text-left text-fg-muted"
          >
            {said}
          </button>
        {/if}
      </div>
    {/each}
  </div>
{:else if markerRows > 0}
  <div class="grid" style="grid-template-columns:{columns};height:{markerRows * ALL_DAY_PX}px">
    {#each days as _, index}
      <div class="border-line border-l" style="grid-row:1 / span {markerRows};grid-column:{index + 1}"></div>
    {/each}
    {#each drawnMarkers as marker (marker.key)}
      <a
        href="/projects/{marker.projectId}"
        title={marker.label}
        class="t-micro relative flex min-w-0 items-center gap-1 self-center truncate rounded-sm px-1 py-px
          {marker.kind === 'stage' ? 'text-fg' : 'text-fg-muted'}"
        style="grid-row:{marker.row + 1};grid-column:{marker.dayIndex + 1} / span {marker.days};margin-right:{BLOCK_GUTTER_PX}px;background:color-mix(in oklab,{marker.color} {marker.kind === 'stage' ? 18 : 10}%,transparent)"
      >
        {#if marker.kind === "stage"}
          <Flag size={10} style="color:{marker.color}" class="shrink-0" />
        {:else}
          <span class="size-1.5 shrink-0 rounded-full" style="background:{marker.color}"></span>
        {/if}
        <span class="truncate">{marker.label}</span>
      </a>
    {/each}
  </div>
{/if}

{#if !folded && rows > 0}
  <div class="grid" style="grid-template-columns:{columns};height:{rows * ALL_DAY_PX}px">
    <!-- Unkeyed, like the day headings: these are the columns' own cells, and moving DOM
         nodes under a scroller resets the very scroll offset this grid is holding. -->
    {#each days as _, index}
      <div class="border-line border-l" style="grid-row:1 / span {rows};grid-column:{index + 1}"></div>
    {/each}
    {#each drawnSpans as span (span.event.id)}
      <!-- The block inside is the focus stop; this answers the keys and the pointer around it. -->
      <div
        data-event-id={span.event.id}
        role="button"
        tabindex="-1"
        class="relative py-0.5"
        style="margin-right:{BLOCK_GUTTER_PX}px;grid-row:{span.row + 1};grid-column:{span.dayIndex + 1} / span {span.days}"
        in:appear={{ id: span.event.id }}
        onclick={(e) => data.tap(span.event, e.currentTarget.getBoundingClientRect(), e.metaKey || e.ctrlKey)}
        onkeydown={(e) => onkeydown(e, span)}
        oncontextmenu={(e) => {
          e.preventDefault();
          data.openContextMenu(span.event, e);
        }}
      >
        <EventBlock event={span.event} {categories} />
      </div>
    {/each}
  </div>
{/if}
