<script lang="ts">
  import { AnchoredPopup, CategoryPicker, PopoverItem } from "$lib/components";
import type { Category } from "$lib/core/records";
  import type { CalendarEvent } from "$lib/calendar/types";
  import ProjectPicker from "./ProjectPicker.svelte";
  import { Copy, Hexagon, Tag, Trash2 } from "lucide-svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";

  /**
   * The handful of things a right-click is for: set what a block (or a whole gathered batch)
   * counts as, duplicate it, or take it off the week. Opens at the pointer rather than beside
   * the block, the way a context menu is expected to.
   */
  let {
    event,
    rect,
    categories,
  }: { event: CalendarEvent; rect: DOMRect; categories: readonly Category[] } = $props();

  const data = calendarData;
  /** A right-click on one of the gathered blocks acts on the whole batch, not just the one under it. */
  const targets = $derived(data.picked.has(event.id) && data.picked.size > 1 ? data.pickedEvents : [event]);
  const batch = $derived(targets.length > 1);
  const deletable = $derived(targets.every((e) => e.movable && !e.allDay));
  const plannable = $derived(categories);

  let categoryRect = $state<DOMRect | null>(null);
  let projectRect = $state<DOMRect | null>(null);

  function close() {
    data.closeContextMenu();
  }

  function openCategoryPicker() {
    categoryRect = rect;
  }

  function chooseCategory(id: string) {
    categoryRect = null;
    close();
    if (batch) void data.mapEvents(targets, [{ categoryId: id, weightPercent: 100 }]);
    else void data.mapEvent(event, event.seriesId ? "series" : "instance", { weights: [{ categoryId: id, weightPercent: 100 }] });
  }

  /** What the block was for. On a batch, every gathered block is tagged the same way. */
  function chooseProject(purpose: { projectId: string | null; practiceId: string | null }) {
    projectRect = null;
    close();
    for (const target of targets) void data.tagEvent(target, purpose);
  }

  function duplicate() {
    close();
    if (batch) void data.duplicateEvents(targets);
    else void data.duplicateEvent(event);
  }

  function del() {
    close();
    for (const target of targets) void data.deleteEvent(target);
  }
</script>

<AnchoredPopup {rect} width={200} onclose={close}>
  <div class="py-1">
    {#if batch}
      <p class="t-micro px-3 pt-1 pb-1.5 text-fg-faint">{targets.length} selected</p>
    {/if}

    <PopoverItem label="Set category" onclick={openCategoryPicker}>
      {#snippet icon()}<Tag size={15} class="shrink-0 text-fg-faint" />{/snippet}
    </PopoverItem>

    <PopoverItem label="Tag to project" onclick={() => (projectRect = rect)}>
      {#snippet icon()}<Hexagon size={15} class="shrink-0 text-fg-faint" />{/snippet}
    </PopoverItem>

    <PopoverItem label="Duplicate{batch ? ` ${targets.length}` : ''}" onclick={duplicate}>
      {#snippet icon()}<Copy size={15} class="shrink-0 text-fg-faint" />{/snippet}
    </PopoverItem>

    {#if deletable}
      <PopoverItem label="Delete{batch ? ` ${targets.length}` : ''}" tone="danger" onclick={del}>
        {#snippet icon()}<Trash2 size={15} class="shrink-0 text-danger" />{/snippet}
      </PopoverItem>
    {/if}
  </div>
</AnchoredPopup>

{#if categoryRect}
  <CategoryPicker
    rect={categoryRect}
    categories={plannable}
    value={batch ? "" : (event.weights[0]?.categoryId ?? "")}
    onchoose={chooseCategory}
    onclose={() => (categoryRect = null)}
  />
{/if}

{#if projectRect}
  <ProjectPicker
    rect={projectRect}
    categoryId={batch ? undefined : event.weights[0]?.categoryId}
    value={batch ? "" : event.projectId ? `project:${event.projectId}` : event.practiceId ? `practice:${event.practiceId}` : ""}
    onchoose={chooseProject}
    onclose={() => (projectRect = null)}
  />
{/if}
