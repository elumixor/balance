<script lang="ts">
  import { CardRow, Textarea } from "$lib/components";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import { NotebookPen } from "lucide-svelte";

  /**
   * What you want to remember about this meeting, and nobody else can read.
   *
   * The event's own description is part of the invitation — every guest gets it, in their mail
   * and on their own copy — so preparation, a line about the person, what to do next, all of it
   * has nowhere to go on the calendar itself. These notes live on this app's record of the event
   * instead, which is also why the box is open on an invitation nothing else here can change.
   */
  let { draft, editable }: { draft: EventDraft; editable: boolean } = $props();

  const ROWS = 2;
</script>

<div class="border-t border-line px-2 py-1.5">
  <CardRow icon={NotebookPen} set={Boolean(draft.privateNotes.trim())} align="start">
    <div class="min-w-0 flex-1">
      {#if editable}
        <Textarea
          bind:value={draft.privateNotes}
          oninput={() => draft.queuePrivate()}
          rows={ROWS}
          placeholder="Private notes"
          ariaLabel="Private notes, only you can see these"
          variant="bare"
        />
      {:else if draft.privateNotes}
        <p class="t-label px-2 py-1.5 whitespace-pre-wrap text-fg-muted">{draft.privateNotes}</p>
      {:else}
        <p class="t-label px-2 py-1.5 text-fg-faint">Private notes</p>
      {/if}
    </div>
  </CardRow>
</div>
