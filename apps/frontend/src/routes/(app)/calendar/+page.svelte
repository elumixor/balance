<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { CalendarPanel, EventEditor, PlanningBar, SidePanelSection, WeekGrid } from "./components";
  import { ConnectGoogle } from "$lib/calendar/components";
  import { Button, Divider, Popover, StarBadge, ThemeToggle } from "$lib/components";
  import { categories } from "$lib/synced.svelte";
  import { settings } from "$lib/settings";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import { slotNow } from "$lib/planning/zone";
  import { Menu } from "lucide-svelte";
  import { untrack } from "svelte";
  import { viewport } from "$lib/viewport.svelte";

  /**
   * The whole window is the week. Everything that isn't the grid — the calendars, where you are
   * in the year, how the week is filling up against its targets — sits in the rail, so the grid
   * keeps the whole window. A phone has no rail, so the same panel hangs off the bar's one button,
   * which is also the only way into the app's settings without a keyboard.
   */
  const data = calendarData;
  void data.enter();

  /**
   * `?plan=YYYY-MM-DD` turns this screen into the planner: same grid, same drags, one day lit and
   * a bar along the bottom. The parameter rather than a flag on the class is what makes it survive
   * a reload — and a reload is exactly when the state that sent us here is gone, so the session is
   * asked for again to recover the day's budget.
   */
  const planning = $derived(page.url.searchParams.get("plan"));

  $effect(() => {
    if (!planning) return void (planMode.active && planMode.stop());
    if (planMode.day === planning) return;

    void (async () => {
      await sessionData.enter(slotNow());
      const summary = sessionData.summary;
      if (!summary || summary.target.day !== planning) return;
      planMode.day = planning;
      planMode.budgetHours = summary.target.budgetHours;
      planMode.threshold = summary.coverageThreshold;
      planMode.award = summary.award;
    })();
  });

  // The day being planned is brought on screen: in the middle of a phone's three columns, so
  // both neighbours are there to drag from, and in its own week on a desktop.
  $effect(() => {
    const day = planMode.day;
    if (!day) return;
    const [year, month, date] = day.split("-").map(Number);
    untrack(() => data.goToDate(new Date(year, month - 1, date - (viewport.md ? 0 : 1))));
  });

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
        (event) => event.movable && !event.allDay,
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

<div class="relative flex h-full min-h-0 flex-col">
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
      <div class="flex items-center gap-2">
        <StarBadge />
        <Popover width={330}>
        {#snippet trigger(open: () => void)}
          <Button variant="bare" class="size-8 bg-surface-alt" title="Calendars, week and settings" onclick={open}>
            {#snippet icon()}<Menu size={18} />{/snippet}
          </Button>
        {/snippet}
        {#snippet content(close: () => void)}
          <div class="max-h-[68vh] overflow-y-auto px-3 py-2">
            <CalendarPanel />
          </div>
          <Divider />
          <div class="flex items-center justify-between gap-2 px-3 py-2">
            <ThemeToggle />
            <div class="flex items-center gap-1.5">
              <!-- The sitting, on demand: it is asked for twice a day, and worth opening between. -->
              <Button
                label="Review"
                size="sm"
                variant="outline"
                onclick={() => {
                  close();
                  void goto("/session");
                }}
              />
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
          </div>
        {/snippet}
        </Popover>
      </div>
    </div>
  </header>

  <!-- Planning wears a strip above the grid rather than a card over it: nothing of the day being
       filled is hidden by the thing asking for it, on a phone or a desktop. -->
  {#if planMode.active}
    <PlanningBar />
  {/if}

  <!-- The grid and everything that floats over it. Its own stacking context, under the bar rather
       than behind it, so a failure or a "connect" card can't land on the notch or on the month. -->
  <div class="relative min-h-0 flex-1">
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
