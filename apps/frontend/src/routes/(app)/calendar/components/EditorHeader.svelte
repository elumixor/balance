<script lang="ts">
  import { CategoryIcon, Field, Picker } from "$lib/components";
  import type { Category } from "$lib/core/records";
  import { practices, projects, tasks } from "$lib/core/synced.svelte";
  import { purposeItems, purposeKey, purposeOf } from "$lib/projects/purpose.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { restColor } from "$lib/ui/colors";
  import { DEFAULT_ICON } from "$lib/ui/icons";
  import { categoryItems } from "$lib/ui/picker";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import type { CalendarEvent, MappingScope } from "$lib/calendar/types";
  import type { Pickers } from "./EventEditor.svelte";

  /**
   * The top of the card: what the hour counts as and what it was for on one line, then what it's
   * called. Both are tagged from here, because tagging a grey block after the fact is how a real
   * week is reconciled and it should cost one tap.
   */
  let {
    event,
    draft,
    categories,
    /** What the block counts as, resolved by the card — the same badge the block on the grid wears. */
    category,
    /** Whether what the hour was for is drawn beside the sphere. */
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
  /** The sphere badge, which now sits on the small line above the name. */
  const BADGE = 22;

  // A repeating event always counts as the same thing on every occurrence — only a one-off event
  // gets an instance-scoped mapping.
  const scope: MappingScope = $derived(event.seriesId ? "series" : "instance");

  const key = $derived(purposeKey(event));
  const items = $derived(purposeItems());

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
  /** The project wears its sphere's colour, so the line reads as one thing with the badge. */
  const purposeColor = $derived(items.find((item) => item.key === key)?.color ?? category?.color ?? restColor);

  function choosePurpose(next: { projectId: string | null; practiceId: string | null }) {
    pickers.project = null;
    void draft.write("The project wasn’t saved", data.tagEvent(event, next));
  }

  function createProject(name: string) {
    const created = projectsData.create(null, category?.id);
    if (!created) return;
    projectsData.update(created.id, { name });
    choosePurpose({ projectId: created.id, practiceId: null });
  }

  function detach() {
    void draft.write(
      "The project wasn’t detached",
      data.tagEvent(event, { projectId: null, practiceId: null, taskId: null }),
    );
    pickers.project = null;
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

  function unmap() {
    pickers.category = null;
    void draft.write("The category wasn’t cleared", data.unmapEvent(event));
  }
</script>

<!-- What it counts as and what it was for, on the line above the name. -->
<div class="flex min-w-0 items-center gap-2 px-3 pt-2 pr-28">
  <button
    type="button"
    aria-label="Change category"
    class="press-sm shrink-0 rounded-md"
    onclick={(e) => (pickers.category = e.currentTarget.getBoundingClientRect())}
  >
    <CategoryIcon icon={category?.icon ?? DEFAULT_ICON} color={category?.color ?? restColor} size={BADGE} />
  </button>

  {#if withProject}
    {#if purpose}
      <button
        type="button"
        class="press-sm t-micro min-w-0 truncate rounded px-1 py-0.5"
        style="color:{purposeColor}"
        title="Change what this is for"
        onclick={(e) => (pickers.project = e.currentTarget.getBoundingClientRect())}
      >
        {purpose}
      </button>
    {:else}
      <button
        type="button"
        class="press-sm t-micro shrink-0 rounded px-1 py-0.5 text-fg-faint hover:text-fg"
        onclick={(e) => (pickers.project = e.currentTarget.getBoundingClientRect())}
      >
        Add Project
      </button>
    {/if}
  {/if}
</div>

<!-- What it's called. -->
<div class="flex items-center gap-1 px-3 pt-1 pb-2">
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
  <Picker
    rect={pickers.project}
    width={260}
    {items}
    value={key}
    placeholder="Project or practice"
    ariaLabel="Search projects"
    onchoose={(next) => choosePurpose(purposeOf(next))}
    onclear={detach}
    oncreate={createProject}
    createLabel={(name) => `New project “${name}”`}
    onclose={() => (pickers.project = null)}
  />
{/if}

{#if pickers.category}
  <Picker
    rect={pickers.category}
    items={categoryItems(categories)}
    value={category?.id ?? ""}
    placeholder="Search categories"
    ariaLabel="Search categories"
    onchoose={chooseCategory}
    onclear={unmap}
    onclose={() => (pickers.category = null)}
  />
{/if}
