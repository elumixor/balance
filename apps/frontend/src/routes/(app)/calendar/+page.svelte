<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import CalendarPanel from "$lib/calendar/CalendarPanel.svelte";
  import ConnectGoogle from "$lib/calendar/ConnectGoogle.svelte";
  import EventEditor from "$lib/calendar/EventEditor.svelte";
  import WeekGrid from "$lib/calendar/WeekGrid.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import SidePanelSection from "$lib/components/nav/SidePanelSection.svelte";
  import { categories } from "$lib/synced.svelte";
  import Button from "$lib/components/Button.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { settings } from "$lib/settings.svelte";
  import { Menu } from "lucide-svelte";

  /**
   * The whole window is the week. Everything that isn't the grid — the calendars, where you are
   * in the year, how the week is filling up against its targets — sits in the rail, so the grid
   * keeps the whole window. A phone has no rail, so the same panel hangs off the bar's one button,
   * which is also the only way into the app's settings without a keyboard.
   */
  const data = calendarData;
  void data.enter();

  const plan = $derived(categories.all);
  const categoryById = $derived(new Map(plan.map((category) => [category.id, category])));
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

<div class="flex h-full min-h-0 flex-col">
  <!-- The phone's bar for this screen. A real row rather than chips floating over the grid: a
       translucent button sat on the very day heading it covered, and the notch left it nowhere to
       sit at all. From `md` up the rail carries all of this, so the grid keeps the whole window. -->
  <header class="safe-top shrink-0 border-b border-line bg-surface md:hidden">
    <div class="flex h-12 items-center justify-between gap-2 px-3">
      <!-- Where the days on screen are in the year, and the way back to today. Red while the
           window is over this week, the same red the grid gives today's own column. -->
      <button
        type="button"
        onclick={() => data.goToToday()}
        class="t-heading press-sm -mx-1 rounded-md px-1 whitespace-nowrap {data.isThisWeek
          ? 'text-danger'
          : 'text-fg'}"
      >
        {data.monthLabel}
      </button>

      <!-- One door onto everything the phone has no rail for: which calendars are drawn, where in
           the year the grid is, how the week is filling up — and, under the rule, the app's own
           settings, which until now only a keyboard could reach. -->
      <Popover width={330}>
        {#snippet trigger(open: () => void)}
          <IconButton label="Calendars, week and settings" onclick={open}>
            <Menu size={18} />
          </IconButton>
        {/snippet}
        {#snippet content(close: () => void)}
          <div class="max-h-[68vh] overflow-y-auto px-3 py-2">
            <CalendarPanel />
          </div>
          <Divider />
          <div class="flex items-center justify-between gap-2 px-3 py-2">
            <ThemeToggle />
            <Button
              label="Settings"
              size="sm"
              variant="outline"
              onclick={() => {
                close();
                settings.show();
              }}
            />
          </div>
        {/snippet}
      </Popover>
    </div>
  </header>

  <!-- The grid and everything that floats over it. Its own stacking context, under the bar rather
       than behind it, so a failure or a "connect" card can't land on the notch or on the month. -->
  <div class="relative min-h-0 flex-1">
    {#if data.actionError}
      <!-- A card of its own, not bare text: this floats over the day headings, and a message
           printed straight onto them was two sentences reading as one. -->
      <div class="absolute inset-x-0 top-2 z-20 px-3 md:px-4">
        <p class="t-micro rounded-md border border-line bg-surface px-3 py-2 text-danger shadow-(--shadow-float)">
          {data.actionError}
        </p>
      </div>
    {/if}

    <!-- The week that failed to load still has its days, hours and today's line, so the grid keeps
         the screen and the failure asks for a retry from on top of it. -->
    {#if week.error}
      <div class="absolute inset-x-0 top-2 z-20 px-3 md:px-4">
        <LoadError message={week.error} onretry={() => void week.refresh()} />
      </div>
    {/if}

    {#if data.connectionKnown && !data.connected}
      <!-- The rail already asks on a wide screen, so there the empty week itself is the answer. -->
      <div class="flex h-full items-center justify-center p-6 md:hidden">
        <div class="w-full max-w-sm"><ConnectGoogle /></div>
      </div>
    {/if}
    <!-- One grid, always mounted, never a skeleton: an empty week is drawn entirely from the clock,
         and the events fill into it when they land. A second instance would remount it, and a
         remounted scroller forgets which day it was on. -->
    <div class="h-full {data.connectionKnown && !data.connected ? 'hidden md:block' : ''}">
      <WeekGrid categories={categoryById} />
    </div>
  </div>
</div>

{#if data.selected}
  <!-- Unkeyed: the card loads whatever event it's handed, and rebuilding it would take the cursor
       out of a name being typed the moment the calendar gives that block its real id. -->
  <EventEditor event={data.selected} rect={data.selectedRect} categories={plan} />
{/if}
