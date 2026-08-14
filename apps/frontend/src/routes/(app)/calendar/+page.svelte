<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import CalendarPanel from "$lib/calendar/CalendarPanel.svelte";
  import ConnectGoogle from "$lib/calendar/ConnectGoogle.svelte";
  import EventEditor from "$lib/calendar/EventEditor.svelte";
  import SelectionBar from "$lib/calendar/SelectionBar.svelte";
  import WeekGrid from "$lib/calendar/WeekGrid.svelte";
  import WeekMeters from "$lib/calendar/WeekMeters.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SidePanelSection from "$lib/components/nav/SidePanelSection.svelte";
  import { addDays, DAYS_PER_WEEK } from "$lib/dates";
  import { store } from "$lib/store.svelte";
  import { SlidersHorizontal } from "lucide-svelte";

  /**
   * The whole window is the week. Everything that isn't the grid — the calendars, the activity
   * chips — sits in the rail, and what's left above the grid is a single strip: where you are in
   * the year, and how the week is filling up against its targets.
   */
  const data = calendarData;
  void data.enter();

  const categories = $derived(store.categories.value ?? []);
  const categoryById = $derived(new Map(categories.map((c) => [c.id, c])));
  const activities = $derived(store.activities.value ?? []);
  const week = $derived(data.week);

  /** "August 2026", or "Jul – Aug 2026" for the weeks that straddle two. */
  const monthLabel = $derived.by(() => {
    const end = addDays(data.weekStart, DAYS_PER_WEEK - 1);
    const year = end.getFullYear();
    if (data.weekStart.getMonth() === end.getMonth()) {
      return `${end.toLocaleDateString(undefined, { month: "long" })} ${year}`;
    }
    const from = data.weekStart.toLocaleDateString(undefined, { month: "short" });
    const to = end.toLocaleDateString(undefined, { month: "short" });
    return `${from} – ${to} ${year}`;
  });

  /**
   * ⌘Z takes back the last write to the week — a move, an edit, a delete, what a block counts as.
   * Inside a text field it's the field's own undo that's being asked for, and that one is the
   * browser's; the editor writes what it holds a moment after the typing stops anyway, so an undo
   * there works its way back out to the calendar on its own.
   */
  function onkeydown(e: KeyboardEvent) {
    // Escape lets go of a gathered batch — the editor's own popup handles its own Escape.
    if (e.key === "Escape" && data.picked.size > 0) return data.clearPicked();
    // Alt toggles a move into a copy the instant it's pressed, not on the next pointer move.
    if (e.key === "Alt") return data.setDragCopy(true);

    const target = e.target as HTMLElement | null;
    const typing = target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    // Delete takes the gathered blocks off the week, or — with none gathered — the open one.
    if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
      const targets = (data.picked.size > 0 ? data.pickedEvents : data.selected ? [data.selected] : []).filter(
        (event) => !event.readOnly && !event.allDay,
      );
      if (!targets.length) return;
      e.preventDefault();
      data.clearPicked();
      data.deselect();
      for (const event of targets) void data.deleteEvent(event);
      return;
    }

    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const redo = key === "y" || (key === "z" && e.shiftKey);
    if (key !== "z" && !redo) return;
    if (typing) return;

    e.preventDefault();
    void (redo ? data.redo() : data.undo());
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.key === "Alt") data.setDragCopy(false);
  }
</script>

<svelte:window {onkeydown} {onkeyup} />

<!-- The rail carries this screen's own controls; on a phone they're behind the strip's one button. -->
<SidePanelSection>
  <CalendarPanel />
</SidePanelSection>

<div class="safe-top flex h-full min-h-0 flex-col">
  <header class="flex items-center gap-3 border-b border-line px-3 py-2 md:px-4">
    <!-- The week changes by scrolling the grid sideways; this only offers the way back to today. -->
    <button
      type="button"
      onclick={() => data.goToToday()}
      class="t-heading press-sm shrink-0 rounded-md px-1.5 py-1 whitespace-nowrap {data.isThisWeek
        ? 'text-danger'
        : 'text-fg-muted'}"
    >
      {monthLabel}
    </button>

    <WeekMeters events={data.events} {categories} weekStart={data.weekStart} />

    <!-- Nothing connected yet? The empty week below is already asking, so this stays out of it. -->
    <div class="md:hidden" class:hidden={!data.connected}>
      <Popover width={280}>
        {#snippet trigger(open: () => void)}
          <IconButton label="Calendars and activities" onclick={open}>
            <SlidersHorizontal size={16} />
          </IconButton>
        {/snippet}
        {#snippet content()}
          <div class="p-3"><CalendarPanel /></div>
        {/snippet}
      </Popover>
    </div>
  </header>

  {#if data.actionError}
    <div class="px-3 pt-2 md:px-4"><InlineError message={data.actionError} /></div>
  {/if}

  {#if week.error && !data.ready}
    <div class="p-4"><LoadError message={week.error} onretry={() => void week.refresh()} /></div>
  {:else if !data.ready}
    <div class="p-4"><Skeleton height={384} radius={10} /></div>
  {:else}
    {#if !data.connected}
      <!-- The rail already asks on a wide screen, so there the empty week itself is the answer. -->
      <div class="flex flex-1 items-center justify-center p-6 md:hidden">
        <div class="w-full max-w-sm"><ConnectGoogle /></div>
      </div>
    {/if}
    <!-- One grid, shown or hidden. A second instance would remount it, and a remounted scroller
         forgets which day it was on. -->
    <div class="min-h-0 flex-1 {data.connected ? '' : 'hidden md:block'}">
      <WeekGrid categories={categoryById} />
    </div>
  {/if}
</div>

<SelectionBar {categories} />

{#if data.selected}
  <!-- Keyed so opening a second event starts from that event's mapping, not the last one's. -->
  {#key data.selected.id}
    <EventEditor event={data.selected} rect={data.selectedRect} {categories} />
  {/key}
{/if}
