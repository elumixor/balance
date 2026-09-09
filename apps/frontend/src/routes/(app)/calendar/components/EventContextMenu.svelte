<script lang="ts">
  import { AnchoredPopup, Picker, PopoverItem } from "$lib/components";
import type { Category } from "$lib/core/records";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { Copy, Hexagon, Tag, Trash2 } from "lucide-svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { purposeItems, purposeKey, purposeOf, type Purpose } from "$lib/projects/purpose.svelte";
  import { categoryItems } from "$lib/ui/picker";

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
  function chooseProject(purpose: Purpose) {
    projectRect = null;
    close();
    for (const target of targets) void data.tagEvent(target, purpose);
  }

  function duplicate() {
    close();
    if (batch) void data.duplicateEvents(targets);
    else void data.duplicateEvent(event);
  }

  /** A batch goes as-is; a single repeating block is asked how much of its series goes with it. */
  function del() {
    close();
    if (batch) for (const target of targets) void data.deleteEvent(target, "instance");
    else void data.deleteEvent(event);
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
  <Picker
    rect={categoryRect}
    items={categoryItems(plannable)}
    value={batch ? "" : (event.weights[0]?.categoryId ?? "")}
    placeholder="Search categories"
    ariaLabel="Search categories"
    onchoose={chooseCategory}
    onclose={() => (categoryRect = null)}
  />
{/if}

{#if projectRect}
  <Picker
    rect={projectRect}
    width={260}
    items={purposeItems()}
    value={batch ? "" : purposeKey(event)}
    placeholder="Project or practice"
    ariaLabel="Search projects"
    onchoose={(key) => chooseProject(purposeOf(key))}
    onclear={() => chooseProject({ projectId: null, practiceId: null })}
    onclose={() => (projectRect = null)}
  />
{/if}
