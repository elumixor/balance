<script lang="ts">
  import { Check, Repeat } from "lucide-svelte";
  import Button from "$lib/components/Button.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import { formatClock, formatDayDate } from "$lib/format";
  import type { IcsEvent } from "$lib/ics";
  import { icsImport } from "$lib/ics-import.svelte";
  import { store } from "$lib/store.svelte";
  import { categories } from "$lib/synced.svelte";

  /**
   * What an `.ics` file shared into the app looks like before any of it is in the calendar: the
   * events it holds, ticked, with the ones nobody wants to import unticked first. The file is
   * never the decision — see `ics-import.svelte.ts`.
   */

  /**
   * Where the file's events can go: every calendar of every connected account that takes writes.
   * A read-only calendar — a subscribed timetable, somebody else's shared week — would refuse
   * them, so it isn't offered.
   */
  const writable = $derived(
    (store.calendars.value?.accounts ?? []).flatMap((account) =>
      account.calendars.filter((calendar) => !calendar.readOnly).map((calendar) => ({ account, calendar })),
    ),
  );
  /** Null in the store means "wherever new events go", which is the calendar prefs' own answer. */
  const calendarId = $derived(icsImport.calendarId ?? store.calendars.value?.writeCalendarId ?? "");
  const plan = $derived(categories.all);

  // The pickers are the reason: the sheet can open on any screen, including one that has never
  // needed the list of calendars.
  $effect(() => {
    if (icsImport.open) void store.calendars.ensure();
  });

  /** Two accounts can both have a "Work", so the address is what tells them apart. */
  function calendarLabel(account: { email: string | null }, calendar: { name: string }) {
    return account.email ? `${calendar.name} — ${account.email}` : calendar.name;
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

<Dialog title="Import from file" open={icsImport.open} onclose={() => icsImport.dismiss()}>
  <div class="space-y-4">
    <p class="t-caption text-fg-muted">{icsImport.fileName}</p>

    {#if icsImport.imported !== null}
      <p class="t-body flex items-center gap-2">
        <Check size={16} />
        {icsImport.imported} event{icsImport.imported === 1 ? "" : "s"} added to your calendar.
      </p>
    {/if}

    {#if icsImport.error}
      <InlineError message={icsImport.error} />
    {/if}

    {#if icsImport.candidates.length > 0}
      <div class="flex items-center justify-between">
        <span class="t-caption text-fg-muted">
          {icsImport.selectedCount} of {icsImport.candidates.length} selected
        </span>
        <button
          type="button"
          class="t-caption press-sm rounded-md px-2 py-1 text-fg-muted hoverable"
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
                <span class="t-caption block text-fg-muted">{when(candidate.event)}</span>
                {#if candidate.event.location}
                  <span class="t-caption block truncate text-fg-muted">{candidate.event.location}</span>
                {/if}
                {#if candidate.event.recurring}
                  <span class="t-caption mt-1 flex items-center gap-1 text-fg-muted">
                    <Repeat size={12} /> Repeats — only the first one is imported
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>

      <!-- One calendar and one category for the whole file: decided here, once, above the button
           that acts on them. -->
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="t-body">Calendar</span>
          <select
            value={calendarId}
            aria-label="Calendar to import into"
            disabled={writable.length === 0}
            onchange={(e) => (icsImport.calendarId = e.currentTarget.value)}
            class="t-body min-w-0 max-w-[62%] truncate rounded-md border border-line-strong bg-surface px-2 py-1"
          >
            {#if writable.length === 0}
              <option value="">Your calendar</option>
            {/if}
            {#each writable as { account, calendar } (calendar.id)}
              <option value={calendar.id}>{calendarLabel(account, calendar)}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="t-body">Counts as</span>
          <select
            value={icsImport.categoryId ?? ""}
            aria-label="Category the imported events count as"
            onchange={(e) => (icsImport.categoryId = e.currentTarget.value || null)}
            class="t-body min-w-0 max-w-[62%] truncate rounded-md border border-line-strong bg-surface px-2 py-1"
          >
            <option value="">Nothing yet</option>
            {#each plan as category (category.id)}
              <option value={category.id}>{category.name}</option>
            {/each}
          </select>
        </div>
      </div>

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
