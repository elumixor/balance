<script lang="ts">
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import type { Meeting } from "$lib/meeting";
  import { Check, Copy, Link2, Video, X } from "lucide-svelte";

  /**
   * How you get into the call. With one on the event: its name, a copy, a Join. Without: the
   * two ways of putting one there — the calendar makes a Meet, or a link to somebody else's call
   * is pasted in, which lands in the notes where the card already reads links from.
   */
  let {
    meeting,
    conferenceName,
    joinUrl,
    editable,
    onjoin,
    oncopy,
    copied,
    oncreate,
    onremove,
    onpaste,
  }: {
    meeting: Meeting;
    conferenceName: string | null;
    joinUrl: string | null;
    editable: boolean;
    onjoin: (url: string) => void;
    oncopy: (url: string) => void;
    copied: string | null;
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

  /** The list belongs to the page: inside the card it would be clipped by the card's own scroll. */
  function autofocus(node: HTMLInputElement) {
    node.focus();
  }
</script>

{#if meeting.join}
  {@const done = copied === meeting.join.url}
  <div class="flex w-full items-center gap-3 py-1.5">
    <Video size={16} class="shrink-0 text-fg-muted" />
    <span class="t-label min-w-0 flex-1 truncate">{conferenceName ?? meeting.join.label}</span>
    <button
      type="button"
      class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
      aria-label={done ? "Link copied" : "Copy link"}
      title={done ? "Copied" : "Copy link"}
      onclick={() => oncopy(meeting.join?.url ?? "")}
    >
      {#if done}<Check size={14} />{:else}<Copy size={14} />{/if}
    </button>
    <button
      type="button"
      class="press shrink-0 rounded-md bg-ink px-2.5 py-1 text-ink-fg"
      onclick={() => onjoin(joinUrl ?? meeting.join?.url ?? "")}
    >
      <span class="t-label">Join</span>
    </button>
    {#if editable && meeting.join.provider === "meet"}
      <button
        type="button"
        aria-label="Remove the call"
        onclick={onremove}
        class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
      >
        <X size={14} />
      </button>
    {/if}
  </div>
{:else if pasting}
  <div class="flex w-full items-center gap-3 py-1.5">
    <Link2 size={16} class="shrink-0 text-fg-faint" />
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
      class="t-body h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-fg
        placeholder:text-fg-faint focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
    />
  </div>
{:else if editable}
  <Popover width={220} align="start">
    {#snippet trigger(open)}
      <button
        type="button"
        onclick={open}
        class="press-sm hoverable -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-md px-1 py-1.5 text-left"
      >
        <Video size={16} class="shrink-0 text-fg-faint" />
        <span class="t-label text-fg-faint">Conferencing</span>
      </button>
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
        label="Paste a link…"
        onclick={() => {
          pasting = true;
          close();
        }}
      />
    {/snippet}
  </Popover>
{:else}
  <div class="flex w-full items-center gap-3 py-1.5">
    <Video size={16} class="shrink-0 text-fg-faint" />
    <span class="t-label text-fg-faint">No call</span>
  </div>
{/if}
