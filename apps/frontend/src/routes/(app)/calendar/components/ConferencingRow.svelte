<script lang="ts">
  import { CardRow, CopyButton, Popover, PopoverItem } from "$lib/components";
  import type { Meeting } from "$lib/calendar/meeting";
  import { Video, X } from "lucide-svelte";

  /**
   * How you get into the call. With one on the event: its name, a copy, a Join. Without: the
   * two ways of putting one there — the calendar makes a Meet, or a link to somebody else's call
   * is pasted in, which is written as the event's own conferencing block so that every guest's
   * calendar draws a join button for it too.
   */
  let {
    meeting,
    conferenceName,
    joinUrl,
    editable,
    hasCall,
    onjoin,
    oncreate,
    onremove,
    onpaste,
  }: {
    meeting: Meeting;
    conferenceName: string | null;
    joinUrl: string | null;
    editable: boolean;
    /** Whether the call is the event's own block — a link only written in the notes isn't. */
    hasCall: boolean;
    onjoin: (url: string) => void;
    oncreate: () => void;
    onremove: () => void;
    onpaste: (url: string) => void;
  } = $props();

  let pasting = $state(false);
  let pasted = $state("");

  function commitPaste() {
    const url = pasted.trim();
    pasting = false;
    pasted = "";
    if (/^https?:\/\//i.test(url)) onpaste(url);
  }

  function autofocus(node: HTMLInputElement) {
    node.focus();
  }
</script>

{#if meeting.join}
  {@const join = meeting.join}
  <CardRow icon={Video} set>
    <span class="t-label min-w-0 flex-1 truncate">{conferenceName ?? join.label}</span>
    <CopyButton text={() => join.url} label="Copy link" size={14} />
    <button
      type="button"
      class="press t-label shrink-0 rounded-md bg-ink px-2.5 py-1 text-ink-fg"
      onclick={() => onjoin(joinUrl ?? join.url)}
    >
      Join
    </button>
    {#if editable && hasCall}
      <button
        type="button"
        aria-label="Remove the call"
        onclick={onremove}
        class="press-sm hoverable shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
      >
        <X size={14} />
      </button>
    {/if}
  </CardRow>
{:else if pasting}
  <CardRow icon={Video}>
    <input
      use:autofocus
      bind:value={pasted}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          commitPaste();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          pasting = false;
        }
      }}
      onblur={commitPaste}
      placeholder="Paste a Zoom, Teams or other link"
      aria-label="Call link"
      autocomplete="off"
      spellcheck="false"
      class="field-bare flex-1"
    />
  </CardRow>
{:else if editable}
  <Popover width={220} align="start">
    {#snippet trigger(open)}
      <CardRow icon={Video} label="Conferencing" onclick={open} />
    {/snippet}
    {#snippet content(close)}
      <PopoverItem
        label="Google Meet"
        onclick={() => {
          oncreate();
          close();
        }}
      />
      <PopoverItem
        label="Paste a Zoom or Teams link…"
        onclick={() => {
          pasting = true;
          close();
        }}
      />
    {/snippet}
  </Popover>
{:else}
  <CardRow icon={Video} label="No call" />
{/if}
