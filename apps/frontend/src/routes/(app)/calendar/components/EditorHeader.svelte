<script lang="ts">
  import { CategoryIcon, CategoryPicker, Field } from "$lib/components";
  import type { Category } from "$lib/core/records";
  import { practices, projects, tasks } from "$lib/core/synced.svelte";
  import { restColor } from "$lib/ui/colors";
  import { DEFAULT_ICON } from "$lib/ui/icons";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import type { CalendarEvent, MappingScope } from "$lib/calendar/types";
  import { X } from "lucide-svelte";
  import type { Pickers } from "./EventEditor.svelte";
  import ProjectPicker from "./ProjectPicker.svelte";

  /**
   * The top of the card: what the hour was for, then what it counts as beside what it's called.
   * The sphere is the icon beside the name, so it is not said twice; the purpose is tagged from
   * here, because tagging a grey block after the fact is how a real week is reconciled and it
   * should cost one tap.
   */
  let {
    event,
    draft,
    categories,
    /** What the block counts as, resolved by the card — the same badge the block on the grid wears. */
    category,
    /** Whether the project line is drawn, which is where the actions row sits when it is. */
    withProject,
    pickers = $bindable(),
    /** The name field, for the card to put the cursor in. */
    titleEl = $bindable(null),
    /** Called when the name is done with — Enter keeps it, Escape drops it — so the card can go. */
    onclose,
  }: {
    event: CalendarEvent;
    draft: EventDraft;
    categories: readonly Category[];
    category: Category | null;
    withProject: boolean;
    pickers: Pickers;
    titleEl: HTMLInputElement | null;
    onclose: () => void;
  } = $props();

  /** Enter saves the name and closes the card; Escape puts back what was there and closes it. */
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") draft.flush();
    else if (e.key === "Escape") draft.revert();
    else return;
    e.preventDefault();
    e.stopPropagation();
    onclose();
  }

  const data = calendarData;
  /** Icon sizes: the sphere badge, and the cross on the purpose pill. */
  const BADGE = 28;
  const DETACH = 11;

  // A repeating event always counts as the same thing on every occurrence — only a one-off event
  // gets an instance-scoped mapping.
  const scope: MappingScope = $derived(event.seriesId ? "series" : "instance");

  /** "Project / task", by name — the tag is the id, the card says the thing. */
  const purpose = $derived.by(() => {
    const task = event.taskId ? tasks.all.find((t) => t.id === event.taskId) : null;
    if (event.projectId) {
      const project = projects.all.find((p) => p.id === event.projectId)?.name ?? "A project";
      return task ? `${project} / ${task.title}` : project;
    }
    if (event.practiceId) return practices.all.find((p) => p.id === event.practiceId)?.name ?? "A practice";
    return null;
  });
  const purposeKey = $derived(
    event.projectId ? `project:${event.projectId}` : event.practiceId ? `practice:${event.practiceId}` : "",
  );
  /** Whether the cross on the pill has been pressed once and is waiting to be meant. */
  let detaching = $state(false);

  // Another block is another question; a "Detach?" left open belongs to the last one.
  $effect(() => {
    event.id;
    detaching = false;
  });

  function choosePurpose(next: { projectId: string | null; practiceId: string | null }) {
    pickers.project = null;
    void draft.write("The project wasn’t saved", data.tagEvent(event, next));
  }

  function detach() {
    detaching = false;
    void draft.write("The project wasn’t detached", data.tagEvent(event, { projectId: null, practiceId: null, taskId: null }));
  }

  /**
   * One category, whole: a split across several is a thing the week screen sets, not this card.
   * With other blocks gathered, the choice applies to the whole batch rather than just this one.
   */
  function chooseCategory(categoryId: string) {
    pickers.category = null;
    const weights = [{ categoryId, weightPercent: 100 }];
    if (data.picked.size > 0) {
      void draft.write("The category wasn’t saved", data.mapEvents(data.pickedEvents, weights));
      data.clearPicked();
      return;
    }
    void draft.write("The category wasn’t saved", data.mapEvent(event, scope, { weights }));
  }
</script>

{#if withProject}
  <div class="flex min-w-0 items-center gap-1.5 px-3 pt-2 pr-28">
    {#if purpose}
      <span class="t-micro flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-fg-muted">
        <button
          type="button"
          class="press-sm min-w-0 truncate hover:text-fg"
          title="Change what this is for"
          onclick={(e) => (pickers.project = e.currentTarget.getBoundingClientRect())}
        >
          {purpose}
        </button>
        {#if !detaching}
          <button
            type="button"
            aria-label="Detach from {purpose}"
            onclick={() => (detaching = true)}
            class="press-sm shrink-0 rounded p-0.5 text-fg-faint hover:text-fg"
          >
            <X size={DETACH} />
          </button>
        {/if}
      </span>
      {#if detaching}
        <span class="t-micro flex shrink-0 items-center gap-2 text-fg-muted">
          Detach?
          <button type="button" onclick={detach} class="press-sm t-micro text-fg underline">Yes</button>
          <button type="button" onclick={() => (detaching = false)} class="press-sm t-micro text-fg-faint">No</button>
        </span>
      {/if}
    {:else}
      <button
        type="button"
        class="press-sm t-micro shrink-0 rounded px-1 py-0.5 text-fg-faint hover:text-fg"
        onclick={(e) => (pickers.project = e.currentTarget.getBoundingClientRect())}
      >
        Add Project
      </button>
    {/if}
  </div>
{/if}

<!-- What it counts as and what it's called, beside the things you can do to it. -->
<div class="flex items-center gap-1 px-3 pb-2 {withProject ? 'pt-1' : 'pt-2 pr-28'}">
  <button
    type="button"
    aria-label="Change category"
    class="press-sm shrink-0 rounded-md"
    onclick={(e) => (pickers.category = e.currentTarget.getBoundingClientRect())}
  >
    <CategoryIcon icon={category?.icon ?? DEFAULT_ICON} color={category?.color ?? restColor} size={BADGE} />
  </button>
  {#if draft.editable}
    <Field
      bind:value={draft.title}
      bind:element={titleEl}
      oninput={() => draft.queue()}
      onkeydown={onTitleKey}
      placeholder="Untitled"
      variant="bare"
      ariaLabel="Event title"
      class="t-heading h-9 py-1"
    />
  {:else}
    <h2 class="t-heading flex-1 truncate px-2 py-1">{event.title}</h2>
  {/if}
</div>

{#if pickers.project}
  <ProjectPicker
    rect={pickers.project}
    value={purposeKey}
    categoryId={category?.id}
    onchoose={choosePurpose}
    onclose={() => (pickers.project = null)}
  />
{/if}

{#if pickers.category}
  <CategoryPicker
    rect={pickers.category}
    {categories}
    value={category?.id ?? ""}
    onchoose={chooseCategory}
    onclose={() => (pickers.category = null)}
  />
{/if}
