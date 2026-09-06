<script lang="ts">
  import { CardRow, CopyButton, Textarea } from "$lib/components";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import { asGoogleAccount, type Meeting, partsOf } from "$lib/calendar/meeting";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { AlignLeft } from "lucide-svelte";

  /** What it says: typed into while it can be, read as words and link pills otherwise. */
  let {
    event,
    draft,
    meeting,
    accountEmail,
    onopen,
  }: {
    event: CalendarEvent;
    draft: EventDraft;
    meeting: Meeting;
    accountEmail: string | null;
    onopen: (url: string) => void;
  } = $props();

  const NOTES_ROWS = 2;
  const COPY_ICON = 12;

  /** The notes as words and pills, each link drawn where it was written. */
  const parts = $derived(partsOf(event.description ?? ""));
  /**
   * Links the notes don't spell out — the conferencing block's, one in the location — still get
   * a pill, after the words, so the description is the one place a link is copied from.
   */
  const extraLinks = $derived.by(() => {
    const written = new Set(parts.flatMap((part) => ("link" in part ? [part.link.url] : [])));
    const all = meeting.join ? [{ url: meeting.join.url, label: meeting.join.label }, ...meeting.links] : meeting.links;
    return all.filter((link) => !written.has(link.url));
  });
</script>

{#snippet pill(link: { url: string; label: string })}
  <span class="group/pill relative inline-block max-w-full align-baseline">
    <span class="chip-bare max-w-full">
      <span class="min-w-0 truncate">{link.label}</span>
    </span>
    <!-- The same pill, laid over the first and grown by an icon when pointed at, so the words never move. -->
    <span
      class="chip-bare absolute top-0 left-0 z-10 h-full max-w-none whitespace-nowrap opacity-0 transition-opacity group-hover/pill:opacity-100 has-[:focus-visible]:opacity-100"
    >
      <button type="button" class="press-sm text-left" onclick={() => onopen(asGoogleAccount(link.url, accountEmail))}>
        {link.label}
      </button>
      <!-- Copies the link as it was written, not the account-tagged one a press opens. -->
      <span class="inline-flex max-w-0 overflow-hidden transition-[max-width] duration-150 group-hover/pill:max-w-6 has-[:focus-visible]:max-w-6">
        <CopyButton text={() => link.url} label="Copy link" size={COPY_ICON} />
      </span>
    </span>
  </span>
{/snippet}

<div class="border-t border-line px-2 py-1.5">
  <CardRow icon={AlignLeft} set={Boolean(draft.notes.trim())} align="start">
    <div class="min-w-0 flex-1">
      {#if draft.editable}
        <Textarea
          bind:value={draft.notes}
          oninput={() => draft.queue()}
          rows={NOTES_ROWS}
          placeholder="Description"
          ariaLabel="Event notes"
          variant="bare"
        />
      {:else if event.description}
        <p class="t-label px-2 py-1.5 whitespace-pre-wrap text-fg-muted">
          {#each parts as part, i (i)}
            {#if "link" in part}{@render pill(part.link)}{:else}{part.text}{/if}
          {/each}
        </p>
      {:else}
        <p class="t-label px-2 py-1.5 text-fg-faint">Description</p>
      {/if}
      {#if extraLinks.length > 0}
        <div class="flex flex-wrap gap-1 px-2 pb-1.5">
          {#each extraLinks as link (link.url)}
            {@render pill(link)}
          {/each}
        </div>
      {/if}
    </div>
  </CardRow>
</div>
