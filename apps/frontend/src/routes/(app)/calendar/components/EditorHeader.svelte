<script lang="ts">
  import { CategoryIcon, Field, Picker } from "$lib/components";
  import type { Category } from "$lib/core/records";
  import { practices } from "$lib/core/synced.svelte";
  import { openExternal } from "$lib/desktop/open";
  import { filingItems, filingKey, filingOf } from "$lib/practices/filing.svelte";
  import { restColor } from "$lib/ui/colors";
  import { DEFAULT_ICON } from "$lib/ui/icons";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import { purposeOf as heldPurpose } from "$lib/calendar/purpose";
  import { type Slash, slashAt, withoutSlash } from "$lib/calendar/slash";
  import type { CalendarEvent, MappingScope } from "$lib/calendar/types";
  import { urnHref } from "$lib/calendar/urn";
  import { ExternalLink } from "lucide-svelte";
  import { tick } from "svelte";
  import type { Pickers } from "./EventEditor.svelte";

  /**
   * The top of the card: what the hour counts as and what it was for on one line, then what it's
   * called. Both are one question with one list — a sphere, or a practice inside one — because
   * tagging a grey block after the fact is how a real week is reconciled and it should cost one
   * tap. The same list opens from the name: a `/` typed into it looks up a sphere or a practice
   * without the hands leaving the keys, and Escape closes the list rather than the card. The Keep
   * task a block is for, when it names one, is a link at the end of the same line.
   */
  let {
    event,
    draft,
    categories,
    /** What the block counts as, resolved by the card — the same badge the block on the grid wears. */
    category,
    /** Whether what the hour was for is drawn beside the sphere. */
    withPurpose,
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
    withPurpose: boolean;
    pickers: Pickers;
    titleEl: HTMLInputElement | null;
    onclose: () => void;
  } = $props();

  const data = calendarData;
  /** The sphere badge, which now sits on the small line above the name. */
  const BADGE = 22;
  /** Keys that move the caret, and so take it away from the slash being typed. */
  const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

  // A repeating event always counts as the same thing on every occurrence — only a one-off event
  // gets an instance-scoped mapping.
  const scope: MappingScope = $derived(event.seriesId ? "series" : "instance");

  const items = $derived(filingItems(categories));
  const key = $derived(filingKey(event.practiceId, category?.id));

  /** The practice, by name — the tag is the id, the card says the thing. */
  const purpose = $derived(
    event.practiceId ? (practices.all.find((p) => p.id === event.practiceId)?.name ?? "A practice") : null,
  );
  /** Where the linked task opens, or null for a URN this app has no address for. */
  const workHref = $derived(event.urn ? urnHref(event.urn) : null);
  /** The practice wears its sphere's colour, so the line reads as one thing with the badge. */
  const purposeColor = $derived(items.find((item) => item.key === key)?.color ?? category?.color ?? restColor);

  // --- the `/` in the name -------------------------------------------------------------------

  /** The slash being typed, while its list is open. */
  let slash = $state<Slash | null>(null);
  /** Where a slash was waved away with Escape, so typing on after it doesn't open it again. */
  let dismissedAt = -1;
  let slashPicker = $state<{ handleKey: (e: KeyboardEvent) => boolean }>();

  function readSlash(text: string) {
    const input = titleEl;
    const found = input ? slashAt(text, input.selectionStart ?? text.length) : null;
    if (!found) dismissedAt = -1;
    if (!input || !found || found.start === dismissedAt) return closeSlash();
    slash = found;
    // Under the name, from its left edge: the list hangs off the field it is being typed into.
    const box = input.getBoundingClientRect();
    if (!pickers.slash) pickers.slash = new DOMRect(box.left - 8, box.bottom + 4, 0, 0);
  }

  function closeSlash() {
    slash = null;
    pickers.slash = null;
  }

  /** The slash and its query come out of the name once they've said what they were for. */
  async function fileFromSlash(choice: string) {
    if (!slash) return;
    const { text, caret } = withoutSlash(draft.title, slash);
    closeSlash();
    draft.title = text;
    draft.queue();
    file(choice);
    await tick();
    titleEl?.focus();
    titleEl?.setSelectionRange(caret, caret);
  }

  /** Enter saves the name and closes the card; Escape puts back what was there and closes it. */
  function onTitleKey(e: KeyboardEvent) {
    if (slash) {
      if (e.key === "Escape") {
        dismissedAt = slash.start;
        closeSlash();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (slashPicker?.handleKey(e)) return void e.stopPropagation();
      if (CARET_KEYS.has(e.key)) closeSlash();
    }
    if (e.key === "Enter") draft.flush();
    else if (e.key === "Escape") draft.revert();
    else return;
    e.preventDefault();
    e.stopPropagation();
    onclose();
  }

  // --- what it counts as, and what it was for -------------------------------------------------

  /** One row of the list: a sphere, or a practice that brings its sphere with it. */
  function file(choice: string) {
    pickers.purpose = null;
    const next = filingOf(choice);
    if ("categoryId" in next) chooseCategory(next.categoryId);
    else void draft.write("The practice wasn’t saved", data.tagEvent(event, next));
  }

  /**
   * One category, whole: a split across several is a thing the week screen sets, not this card.
   * With other blocks gathered, the choice applies to the whole batch rather than just this one.
   * A practice from another sphere doesn't come along — its hours have to land on its own ring.
   */
  function chooseCategory(categoryId: string) {
    const weights = [{ categoryId, weightPercent: 100 }];
    if (data.picked.size > 0) {
      void draft.write("The category wasn’t saved", data.mapEvents(data.pickedEvents, weights));
      data.clearPicked();
      return;
    }
    const held = heldPurpose(event);
    const sphereOfWork = practices.all.find((p) => p.id === held.practiceId)?.categoryId;
    const kept = sphereOfWork && sphereOfWork !== categoryId ? { ...held, practiceId: null } : held;
    void draft.write("The category wasn’t saved", data.mapEvent(event, scope, { weights }, kept));
  }

  function unmap() {
    pickers.purpose = null;
    void draft.write("The category wasn’t cleared", data.unmapEvent(event));
  }
</script>

<!-- What it counts as and what it was for, on the line above the name: one press, one list. -->
<div class="flex min-w-0 items-center gap-2 px-3 pt-2 pr-28">
  <button
    type="button"
    aria-label="Change category or practice"
    title="Change category or practice"
    class="press-sm flex min-w-0 items-center gap-2 rounded-md"
    onclick={(e) => (pickers.purpose = e.currentTarget.getBoundingClientRect())}
  >
    <span class="shrink-0">
      <CategoryIcon icon={category?.icon ?? DEFAULT_ICON} color={category?.color ?? restColor} size={BADGE} />
    </span>
    {#if withPurpose && purpose}
      <span class="t-micro min-w-0 truncate px-1 py-0.5" style="color:{purposeColor}">{purpose}</span>
    {/if}
  </button>
  {#if withPurpose && event.urn}
    {#if workHref}
      <a
        href={workHref}
        target="_blank"
        rel="noreferrer"
        title={event.urn}
        onclick={(e) => {
          e.preventDefault();
          void openExternal(workHref);
        }}
        class="press-sm t-micro flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-fg-muted hover:text-fg"
      >
        Keep task
        <ExternalLink size={11} />
      </a>
    {:else}
      <span class="t-micro min-w-0 truncate px-1 py-0.5 text-fg-faint">{event.urn}</span>
    {/if}
  {/if}
</div>

<!-- What it's called. -->
<div class="flex items-center gap-1 px-3 pt-1 pb-2">
  {#if draft.editable}
    <Field
      bind:value={draft.title}
      bind:element={titleEl}
      oninput={(text) => {
        draft.queue();
        readSlash(text);
      }}
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

{#if pickers.purpose}
  <Picker
    rect={pickers.purpose}
    width={280}
    {items}
    value={key}
    placeholder="Category or practice"
    ariaLabel="Search categories and practices"
    onchoose={file}
    onclear={unmap}
    onclose={() => (pickers.purpose = null)}
  />
{/if}

{#if pickers.slash && slash}
  <Picker
    bind:this={slashPicker}
    rect={pickers.slash}
    width={280}
    {items}
    value={key}
    search={slash.query}
    placeholder="Category or practice"
    ariaLabel="Categories and practices"
    onchoose={(choice) => void fileFromSlash(choice)}
    onclose={() => {
      if (slash) dismissedAt = slash.start;
      closeSlash();
    }}
  />
{/if}
