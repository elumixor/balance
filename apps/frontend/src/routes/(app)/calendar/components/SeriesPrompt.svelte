<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { isFirstOccurrence } from "$lib/calendar/occurrence";
  import { followAnchor, layer } from "$lib/components/float";
  import type { Category } from "$lib/core/records";
  import { viewport } from "$lib/platform/viewport.svelte";
  import { ArrowRightFromLine, type Icon, Repeat, X } from "lucide-svelte";
  import { tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { prefersReducedMotion } from "svelte/motion";
  import { fly } from "svelte/transition";
  import EventBlock from "./EventBlock.svelte";

  /**
   * "How much of the series?", asked beside the occurrence it is about, in the same card the
   * event's details open in. The week behind it is dimmed and blurred, and the occurrences the
   * answer under the pointer — or the arrow keys — would touch are drawn back over the blur, so
   * "from here on" is a picture before it is a decision.
   *
   * Arrows move between the answers, Enter takes the one under the cursor, 1–3 take a scope
   * outright, Escape (or a press on the week) is the way out. The series' first occurrence is
   * not offered "future only": from there on is all of it.
   */
  type Scope = "instance" | "following" | "all";

  let {
    /** The first line: what just happened, or is about to, to which event. */
    heading,
    /** The occurrence the question is about — its id, series and start pick out what's affected. */
    event,
    categories,
    /** The glyph for "this one": a calendar page for a change, a bin for a delete. */
    icon,
    /** Tooltip per answer, in order: this one, from here on, all, cancel. */
    hints,
    onchoose,
    oncancel,
  }: {
    heading: string;
    event: Pick<CalendarEvent, "id" | "seriesId" | "seriesStart" | "start">;
    categories: Map<string, Category>;
    icon: typeof Icon;
    hints: [string, string, string, string];
    onchoose: (scope: Scope) => void;
    oncancel: () => void;
  } = $props();

  const MARGIN = 12;
  const GAP = 8;

  const data = calendarData;

  // Read once on purpose: the glyph for "this one", like the event, is fixed for the life of a card.
  // svelte-ignore state_referenced_locally
  const answers = [
    { scope: "instance" as const, label: "This one", icon, hint: hints[0], key: "1" },
    ...(isFirstOccurrence(event)
      ? []
      : [{ scope: "following" as const, label: "Future only", icon: ArrowRightFromLine, hint: hints[1], key: "2" }]),
    { scope: "all" as const, label: "All", icon: Repeat, hint: hints[2], key: "3" },
    { scope: null, label: "Cancel", icon: X, hint: hints[3], key: null },
  ];
  let active = $state(0);

  // The question replaces the card it was asked from: the two would be about the same block,
  // and the week behind them is dimmed for one thing at a time.
  $effect(() => data.deselect());

  function answer(index: number) {
    const scope = answers[index]?.scope;
    if (scope) onchoose(scope);
    else oncancel();
  }

  // --- what the answer under the cursor would touch -------------------------------------------

  /** The occurrences on the strip that the highlighted answer covers: none when it's Cancel. */
  const affected = $derived.by((): CalendarEvent[] => {
    const scope = answers[active]?.scope;
    if (!scope) return [];
    const start = new Date(event.start).getTime();
    return data.events.filter((other) => {
      if (other.id === event.id) return true;
      if (scope === "instance" || !event.seriesId || other.seriesId !== event.seriesId) return false;
      return scope === "all" || new Date(other.start).getTime() >= start;
    });
  });

  interface Lifted {
    key: string;
    event: CalendarEvent;
    rect: DOMRect;
  }
  /** Each affected block as it is drawn on the strip, one copy per day it spans. */
  let lifted = $state<Lifted[]>([]);
  /** Where the question is anchored: the occurrence's own block, or where it was tapped. */
  let anchor = $state<DOMRect | null>(null);

  /** Every block of the whole series on the strip — what the card has to stay out of the way of. */
  let obstacles = $state<DOMRect[]>([]);

  function rectsOf(id: string) {
    return [...document.querySelectorAll<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`)].map((node) =>
      node.getBoundingClientRect(),
    );
  }

  function measure() {
    lifted = affected.flatMap((other) =>
      rectsOf(other.id).map((rect, i) => ({ key: `${other.id}:${i}`, event: other, rect })),
    );
    const series = event.seriesId
      ? data.events.filter((other) => other.seriesId === event.seriesId || other.id === event.id)
      : data.events.filter((other) => other.id === event.id);
    obstacles = series.flatMap((other) => rectsOf(other.id));
    const own = document.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(event.id)}"]`);
    anchor = own?.getBoundingClientRect() ?? data.selectedRect;
  }

  // Measured after the strip has drawn the write the question is about, and again whenever the
  // highlighted answer changes what it covers or the window moves under it.
  $effect(() => {
    void affected;
    let live = true;
    void tick().then(() => live && measure());
    const stop = followAnchor(measure);
    return () => {
      live = false;
      stop();
    };
  });

  // --- the card ------------------------------------------------------------------------------

  let card = $state<HTMLElement>();
  let position = $state<{ left: number; top: number } | null>(null);

  /**
   * Beside the block if there's room — right, then left — and otherwise under or over it: the
   * first place that clears every occurrence of the series and fits on screen, so the answer's
   * picture is never under the question. Worked out from the whole series rather than the
   * highlighted answer, so the card doesn't jump as the cursor moves along the row.
   */
  function place() {
    if (!card) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const maxLeft = window.innerWidth - width - MARGIN;
    const maxTop = window.innerHeight - height - MARGIN;
    const rect = anchor ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2 - height / 2, 0, 0);
    const candidates = [
      { left: rect.right + GAP, top: rect.top },
      { left: rect.left - GAP - width, top: rect.top },
      { left: rect.left, top: rect.bottom + GAP },
      { left: rect.left, top: rect.top - GAP - height },
    ];
    const fits = (c: { left: number; top: number }) =>
      c.left >= MARGIN && c.left <= maxLeft && c.top >= MARGIN && c.top <= maxTop;
    const clear = (c: { left: number; top: number }) =>
      !obstacles.some(
        (o) => c.left < o.right && c.left + width > o.left && c.top < o.bottom && c.top + height > o.top,
      );
    const spot = candidates.find((c) => fits(c) && clear(c)) ?? candidates.find(fits) ?? candidates[2];
    position = {
      left: Math.min(Math.max(MARGIN, spot.left), Math.max(MARGIN, maxLeft)),
      top: Math.min(Math.max(MARGIN, spot.top), Math.max(MARGIN, maxTop)),
    };
  }

  $effect(() => {
    void anchor;
    void obstacles;
    if (!card) return;
    place();
    const observer = new ResizeObserver(place);
    observer.observe(card);
    return () => observer.disconnect();
  });

  // The card takes the keys: a name field left focused behind it would otherwise eat the digits.
  $effect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    card?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const step = (by: number) => {
      active = (active + by + answers.length) % answers.length;
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
    else if (e.key === "Tab") step(e.shiftKey ? -1 : 1);
    else if (e.key === "Enter") answer(active);
    else if (e.key === "Escape") oncancel();
    else {
      const index = answers.findIndex((a) => a.key === e.key);
      if (index < 0) return;
      answer(index);
    }
    e.preventDefault();
    e.stopPropagation();
  }

  const duration = $derived(prefersReducedMotion.current ? 0 : 220);

  /** The week dims and blurs together, rather than the blur landing before the dim has begun. */
  function veil(_node: Element, { duration }: { duration: number }) {
    return {
      duration,
      easing: cubicOut,
      css: (t: number) => `opacity:${t};backdrop-filter:blur(${4 * t}px);-webkit-backdrop-filter:blur(${4 * t}px)`,
    };
  }
</script>

<svelte:window onkeydowncapture={onkeydown} />

<!--
  The whole layer is marked as a popup layer, so the event card underneath — which closes on any
  press outside itself — doesn't take a press on this card as a press away from its own.
-->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  {@attach layer}
  data-popup-layer
  class="fixed inset-0 z-40 overflow-hidden bg-overlay backdrop-blur-sm"
  transition:veil={{ duration }}
  onclick={oncancel}
>
  <!-- The occurrences the answer would touch, drawn back over the blur where they stand. -->
  {#each lifted as item (item.key)}
    <div
      class="pointer-events-none fixed"
      style="left:{item.rect.left}px;top:{item.rect.top}px;width:{item.rect.width}px;height:{item.rect.height}px"
      transition:fly={{ y: 4, duration, easing: cubicOut }}
    >
      <EventBlock event={item.event} {categories} />
    </div>
  {/each}

  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    bind:this={card}
    role="dialog"
    aria-label={heading}
    tabindex="-1"
    class="touch-auto rounded-t-2xl border border-line bg-surface p-1.5 shadow-(--shadow-float) outline-none
      max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:safe-bottom sm:absolute sm:w-max sm:max-w-[calc(100vw-24px)] sm:rounded-lg"
    style="left:{position?.left ?? 0}px;top:{position?.top ?? 0}px;visibility:{position || !viewport.sm
      ? 'visible'
      : 'hidden'}"
    transition:fly={{ y: viewport.sm ? 10 : 400, duration: viewport.sm ? duration : duration * 1.4, easing: cubicOut }}
    onclick={(e) => e.stopPropagation()}
    onpointerdown={(e) => e.stopPropagation()}
  >
    <div class="sheet-handle sm:hidden"></div>
    <p class="t-micro truncate px-2 pt-1 pb-1.5 text-fg-muted">{heading}</p>
    <div class="flex items-center gap-0.5 max-sm:flex-wrap">
      {#each answers as item, i (item.label)}
        {@const Icon = item.icon}
        <button
          type="button"
          class="press-sm t-label flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 whitespace-nowrap
            {i === active ? 'bg-surface-alt text-fg' : 'text-fg-faint hover:text-fg'} {i === answers.length - 1 ? 'ml-auto' : ''}"
          title={item.hint}
          aria-keyshortcuts={item.key ?? "Escape"}
          onpointerenter={() => (active = i)}
          onfocus={() => (active = i)}
          onclick={() => answer(i)}
        >
          <Icon size={15} />
          {item.label}
        </button>
      {/each}
    </div>
  </div>
</div>
