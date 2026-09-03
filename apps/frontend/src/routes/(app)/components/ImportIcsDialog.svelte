<script lang="ts">
  import { Check, ChevronDown, Repeat } from "lucide-svelte";
  import { Button, CategoryIcon, Dialog, Dot, Popover, PopoverItem, ProgressBar } from "$lib/components";
  import { restColor } from "$lib/colors";
  import { DEFAULT_ICON } from "$lib/icons";
  import { formatClock, formatDayDate } from "$lib/format";
  import type { IcsEvent } from "$lib/ics";
  import { icsImport } from "$lib/ics-import.svelte";
  import { store } from "$lib/store.svelte";
  import { categories } from "$lib/synced.svelte";
  import type { Category } from "$lib/types";
  import type { Snippet } from "svelte";

  /**
   * What an `.ics` file shared into the app looks like before any of it is in the calendar: the
   * events it holds, ticked, with the ones nobody wants to import unticked first. The file is
   * never the decision — see `ics-import.svelte.ts`.
   */

  /**
   * Where the file's events can go: every calendar of every connected account that takes writes,
   * grouped the way the rail groups them — two accounts can hold the same names and colours, and
   * the address above the group is what tells them apart. A read-only calendar — a subscribed
   * timetable, somebody else's shared week — would refuse the write, so it isn't offered.
   */
  const byAccount = $derived(
    (store.calendars.value?.accounts ?? [])
      .map((account) => ({ account, calendars: account.calendars.filter((calendar) => !calendar.readOnly) }))
      .filter((group) => group.calendars.length > 0),
  );
  /** Null in the store means "wherever new events go", which is the calendar prefs' own answer. */
  const calendarId = $derived(icsImport.calendarId ?? store.calendars.value?.writeCalendarId ?? "");
  const chosenCalendar = $derived(
    byAccount.flatMap((group) => group.calendars).find((calendar) => calendar.id === calendarId) ?? null,
  );
  const plan = $derived(categories.all);
  /**
   * The category everything lands in until somebody says otherwise: the buffer, which is what an
   * hour nobody planned already counts as. A file of forty events left uncategorised is forty
   * blocks to go back over, and the buffer is the honest answer for all of them meanwhile.
   */
  const buffer = $derived(plan.find((category) => category.isBuffer) ?? null);
  const chosenCategory = $derived(plan.find((category) => category.id === icsImport.categoryId) ?? buffer);

  // The categories can arrive after the sheet is open — a file dropped on a cold start — so this
  // is an effect rather than something the sheet decides once on the way up.
  $effect(() => {
    if (icsImport.open && !icsImport.categoryId && buffer) icsImport.categoryId = buffer.id;
  });

  // The pickers are the reason: the sheet can open on any screen, including one that has never
  // needed the list of calendars.
  $effect(() => {
    if (icsImport.open) void store.calendars.ensure();
  });

  /** The buffer is rest, and rest has a colour of its own — see `week-totals.ts`. */
  function markColor(category: Category | null) {
    return category && !category.isBuffer ? category.color : restColor;
  }

  /** "Fri Aug 14 · 09:00 – 10:30", or the day alone when the event is a day rather than a time. */
  function when(event: IcsEvent) {
    if (event.allDay) {
      // An all-day event is carried as midnight UTC, so it is read back in UTC — this device's
      // zone is exactly what would move it a day.
      const day = event.start
        .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
        .replace(/,/g, "");
      const days = Math.round((event.end.getTime() - event.start.getTime()) / 86_400_000);
      return `${day} · all day${days > 1 ? ` (${days} days)` : ""}`;
    }
    const sameDay = event.start.toDateString() === event.end.toDateString();
    const end = sameDay ? formatClock(event.end) : `${formatDayDate(event.end)} ${formatClock(event.end)}`;
    return `${formatDayDate(event.start)} · ${formatClock(event.start)} – ${end}`;
  }
</script>

{#snippet calendarBadge()}
  <Dot color={chosenCalendar?.color ?? restColor} size={10} />
{/snippet}

{#snippet categoryBadge()}
  {#if chosenCategory}
    {@render categoryMark(chosenCategory)}
  {/if}
{/snippet}

<!-- The buffer is drawn as rest wherever it is drawn — see `week-totals.ts`. -->
{#snippet categoryMark(category: Category)}
  <CategoryIcon icon={category.isBuffer ? DEFAULT_ICON : category.icon} color={markColor(category)} size={20} />
{/snippet}

<!-- What both rows open with: whatever is chosen, drawn the way the rest of the app draws it. -->
{#snippet chooser(open: () => void, ariaLabel: string, label: string, badge: Snippet)}
  <button
    type="button"
    onclick={open}
    aria-label={ariaLabel}
    class="hoverable press-sm flex min-w-0 max-w-[64%] items-center gap-2 rounded-md border border-line px-2 py-1.5
      text-left"
  >
    {@render badge()}
    <span class="t-label min-w-0 flex-1 truncate">{label}</span>
    <ChevronDown size={14} class="shrink-0 text-fg-faint" />
  </button>
{/snippet}

<Dialog title="Import from file" open={icsImport.open} onclose={() => icsImport.dismiss()}>
  <div class="space-y-4">
    <p class="t-micro text-fg-muted">{icsImport.fileName}</p>

    {#if icsImport.imported !== null}
      <p class="t-body flex items-center gap-2">
        <Check size={16} />
        {icsImport.imported} event{icsImport.imported === 1 ? "" : "s"} added to your calendar.
      </p>
    {/if}

    {#if icsImport.candidates.length > 0}
      <div class="flex items-center justify-between">
        <span class="t-micro text-fg-muted">
          {icsImport.selectedCount} of {icsImport.candidates.length} selected
        </span>
        <button
          type="button"
          class="t-micro press-sm rounded-md px-2 py-1 text-fg-muted hoverable"
          onclick={() => icsImport.toggleAll(icsImport.selectedCount < icsImport.candidates.length)}
        >
          {icsImport.selectedCount < icsImport.candidates.length ? "Select all" : "Select none"}
        </button>
      </div>

      <ul class="max-h-[34vh] space-y-1 overflow-y-auto">
        {#each icsImport.candidates as candidate (candidate.key)}
          <li>
            <button
              type="button"
              class="press-sm flex w-full items-start gap-3 rounded-md border border-line px-3 py-2 text-left
                hoverable {candidate.selected ? '' : 'opacity-50'}"
              aria-pressed={candidate.selected}
              onclick={() => icsImport.toggle(candidate.key)}
            >
              <span
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-line
                  {candidate.selected ? 'bg-ink text-ink-fg' : ''}"
              >
                {#if candidate.selected}<Check size={12} />{/if}
              </span>
              <span class="min-w-0 flex-1">
                <span class="t-body block truncate">{candidate.event.title || "Untitled"}</span>
                <span class="t-micro block text-fg-muted">{when(candidate.event)}</span>
                {#if candidate.event.location}
                  <span class="t-micro block truncate text-fg-muted">{candidate.event.location}</span>
                {/if}
                {#if candidate.event.recurring}
                  <span class="t-micro mt-1 flex items-center gap-1 text-fg-muted">
                    <Repeat size={12} /> Repeats — only the first one is imported
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>

      <!-- One calendar and one category for the whole file: decided here, once, above the button
           that acts on them. Both are the app's own popover rather than a system dropdown — a
           calendar is its colour and a category is its glyph, and neither survives an `<option>`. -->
      <div class="space-y-1">
        <div class="flex items-center justify-between gap-3">
          <span class="t-label text-fg-muted">Calendar</span>
          {#if chosenCalendar}
            <Popover width={260}>
              {#snippet trigger(open)}
                {@render chooser(open, "Calendar to import into", chosenCalendar?.name ?? "", calendarBadge)}
              {/snippet}
              {#snippet content(close)}
                {#each byAccount as group (group.account.accountId)}
                  <div class="t-micro truncate px-3 pt-2 pb-1 text-fg-faint">
                    {group.account.email ?? "Unknown account"}
                  </div>
                  {#each group.calendars as calendar (calendar.id)}
                    <PopoverItem
                      label={calendar.name}
                      selected={calendar.id === calendarId}
                      onclick={() => {
                        icsImport.calendarId = calendar.id;
                        close();
                      }}
                    >
                      {#snippet icon()}
                        <Dot color={calendar.color ?? restColor} size={10} />
                      {/snippet}
                    </PopoverItem>
                  {/each}
                {/each}
              {/snippet}
            </Popover>
          {:else}
            <!-- Before the calendar list has loaded, and for an account with nothing writable:
                 the events still go somewhere, and the server is the one that knows where. -->
            <span class="t-label px-2 py-1.5 text-fg-faint">Your calendar</span>
          {/if}
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="t-label text-fg-muted">Counts as</span>
          {#if chosenCategory}
            <Popover width={240}>
              {#snippet trigger(open)}
                {@render chooser(open, "Category the imported events count as", chosenCategory.name, categoryBadge)}
              {/snippet}
              {#snippet content(close)}
                <div class="max-h-64 overflow-y-auto">
                  {#each plan as category (category.id)}
                    <PopoverItem
                      label={category.name}
                      selected={category.id === chosenCategory.id}
                      onclick={() => {
                        icsImport.categoryId = category.id;
                        close();
                      }}
                    >
                      {#snippet icon()}
                        {@render categoryMark(category)}
                      {/snippet}
                    </PopoverItem>
                  {/each}
                </div>
              {/snippet}
            </Popover>
          {:else}
            <!-- No categories to count as yet: the events are still worth importing, and the week
                 counts them as rest until there is something to say instead. -->
            <span class="t-label px-2 py-1.5 text-fg-faint">No categories yet</span>
          {/if}
        </div>
      </div>

      {#if icsImport.progress}
        <!-- A file of forty events is a wait worth showing the shape of, rather than a spinner
             that says only that something is happening. -->
        {@const { done, total } = icsImport.progress}
        <div class="space-y-1.5">
          <ProgressBar ratio={done / total} color={markColor(chosenCategory)} />
          <p class="t-micro text-fg-muted">{done} of {total} imported</p>
        </div>
      {/if}

      <Button
        full
        label={icsImport.selectedCount === 1 ? "Import 1 event" : `Import ${icsImport.selectedCount} events`}
        loading={icsImport.importing}
        disabled={icsImport.selectedCount === 0}
        onclick={() => icsImport.import()}
      />
    {:else}
      <Button full variant="outline" label="Done" onclick={() => icsImport.dismiss()} />
    {/if}
  </div>
</Dialog>
