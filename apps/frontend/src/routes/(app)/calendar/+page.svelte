<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import CalendarPanel from "$lib/calendar/CalendarPanel.svelte";
  import ConnectGoogle from "$lib/calendar/ConnectGoogle.svelte";
  import EventEditor from "$lib/calendar/EventEditor.svelte";
  import WeekGrid from "$lib/calendar/WeekGrid.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SidePanelSection from "$lib/components/nav/SidePanelSection.svelte";
  import { store } from "$lib/store.svelte";
  import { SlidersHorizontal } from "lucide-svelte";

  /**
   * The whole window is the week. Everything that isn't the grid — the calendars, where you are
   * in the year, how the week is filling up against its targets — sits in the rail, so the grid
   * keeps the whole window.
   */
  const data = calendarData;
  void data.enter();

  const categories = $derived(store.categories.value ?? []);
  const categoryById = $derived(new Map(categories.map((c) => [c.id, c])));
  const activities = $derived(store.activities.value ?? []);
  const week = $derived(data.week);

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

<div class="safe-top relative flex h-full min-h-0 flex-col">
  <!-- The grid keeps the whole window now; on a phone, where there's no rail, these two float over
       its top-left gutter and top-right corner instead of spending a row of their own. -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-1 md:hidden">
    <button
      type="button"
      onclick={() => data.goToToday()}
      class="t-heading press-sm pointer-events-auto shrink-0 rounded-md bg-surface/90 px-1.5 py-1 whitespace-nowrap backdrop-blur-sm {data.isThisWeek
        ? 'text-danger'
        : 'text-fg-muted'}"
    >
      {data.monthLabel}
    </button>

    <!-- Nothing connected yet? The empty week below is already asking, so this stays out of it. -->
    <div class="pointer-events-auto rounded-md bg-surface/90 backdrop-blur-sm" class:hidden={!data.connected}>
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
  </div>

  {#if data.actionError}
    <div class="absolute inset-x-0 top-10 z-20 px-3 md:top-2 md:px-4"><InlineError message={data.actionError} /></div>
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

{#if data.selected}
  <!-- Keyed so opening a second event starts from that event's mapping, not the last one's. -->
  {#key data.selected.id}
    <EventEditor event={data.selected} rect={data.selectedRect} {categories} />
  {/key}
{/if}
