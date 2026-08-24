<script lang="ts">
  import { Check, Repeat } from "lucide-svelte";
  import Button from "$lib/components/Button.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import { formatClock, formatDayDate } from "$lib/format";
  import type { IcsEvent } from "$lib/ics";
  import { icsImport } from "$lib/ics-import.svelte";

  /**
   * What an `.ics` file shared into the app looks like before any of it is in the calendar: the
   * events it holds, ticked, with the ones nobody wants to import unticked first. The file is
   * never the decision — see `ics-import.svelte.ts`.
   */

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

      <ul class="max-h-[46vh] space-y-1 overflow-y-auto">
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
