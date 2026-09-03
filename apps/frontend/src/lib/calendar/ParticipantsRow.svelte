<script lang="ts">
  import Dot from "$lib/components/Dot.svelte";
  import type { EventAttendee, EventResponse } from "$lib/types";
  import { Plus, Users, X } from "lucide-svelte";

  /**
   * Who else is coming, and what they said. A line per guest with a dot for their answer, the
   * organizer first; an address typed under the list invites one more, and the cross beside a
   * guest uninvites them — both only on an event you organize, since a guest list is the
   * organizer's to keep.
   */
  let {
    attendees,
    organizer,
    editable,
    onchange,
    answer,
  }: {
    attendees: EventAttendee[];
    organizer: EventAttendee | null;
    /** Whether this is your event to invite people to. */
    editable: boolean;
    onchange: (attendees: { email: string; optional?: boolean }[]) => void;
    /** The row's own RSVP, drawn under the list — only when there is one to give. */
    answer?: import("svelte").Snippet;
  } = $props();

  /** Past this many the list stops being a glance and starts being a page. */
  const SHOWN = 6;

  const RESPONSE_COLORS: Record<EventResponse, string> = {
    accepted: "var(--positive)",
    declined: "var(--danger)",
    tentative: "var(--caution)",
    needsAction: "var(--line-strong)",
  };

  let adding = $state(false);
  let email = $state("");
  let expanded = $state(false);

  const guests = $derived(attendees.filter((a) => !organizer || !sameAs(a, organizer)));
  const listed = $derived(expanded ? guests : guests.slice(0, SHOWN));
  const hidden = $derived(guests.length - listed.length);
  const empty = $derived(!organizer && guests.length === 0);

  function sameAs(a: EventAttendee, b: EventAttendee) {
    if (a.email && b.email) return a.email === b.email;
    return Boolean(a.name) && a.name === b.name;
  }

  const nameOf = (attendee: EventAttendee) => attendee.name ?? attendee.email ?? "Guest";

  /** Everyone with an address, as the calendar takes a list — rooms and the nameless have none. */
  const list = () => attendees.flatMap((a) => (a.email ? [{ email: a.email, optional: a.optional }] : []));

  function invite() {
    const address = email.trim();
    email = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return;
    if (attendees.some((a) => a.email?.toLowerCase() === address.toLowerCase())) return;
    onchange([...list(), { email: address }]);
  }

  function uninvite(attendee: EventAttendee) {
    onchange(list().filter((a) => a.email !== attendee.email));
  }

  function autofocus(node: HTMLInputElement) {
    node.focus();
  }
</script>

{#if empty && !editable}
  <div class="flex w-full items-center gap-3 py-1.5">
    <Users size={16} class="shrink-0 text-fg-faint" />
    <span class="t-label text-fg-faint">No guests</span>
  </div>
{:else if empty && !adding}
  <button
    type="button"
    onclick={() => (adding = true)}
    class="press-sm hoverable -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-md px-1 py-1.5 text-left"
  >
    <Users size={16} class="shrink-0 text-fg-faint" />
    <span class="t-label text-fg-faint">Participants</span>
  </button>
{:else}
  <div class="flex w-full items-start gap-3 py-1.5">
    <Users size={16} class="mt-0.5 shrink-0 text-fg-muted" />
    <div class="min-w-0 flex-1 space-y-1">
      {#if organizer}
        <div class="flex items-center gap-2">
          <Dot color={RESPONSE_COLORS[organizer.response]} size={6} />
          <span class="t-label truncate">{nameOf(organizer)}</span>
          <span class="t-micro shrink-0 text-fg-faint">organizer</span>
        </div>
      {/if}
      {#each listed as attendee, i (attendee.email ?? attendee.name ?? i)}
        <div class="group flex items-center gap-2">
          <Dot color={RESPONSE_COLORS[attendee.response]} size={6} />
          <span class="t-label min-w-0 flex-1 truncate text-fg-muted">{nameOf(attendee)}</span>
          {#if attendee.optional}<span class="t-micro shrink-0 text-fg-faint">optional</span>{/if}
          {#if editable && attendee.email && !attendee.self}
            <button
              type="button"
              aria-label="Uninvite {nameOf(attendee)}"
              onclick={() => uninvite(attendee)}
              class="press-sm shrink-0 rounded p-0.5 text-fg-faint opacity-0 group-hover:opacity-100 hover:text-fg
                focus-visible:opacity-100"
            >
              <X size={12} />
            </button>
          {/if}
        </div>
      {/each}
      {#if hidden > 0}
        <button type="button" onclick={() => (expanded = true)} class="t-micro pl-4 text-fg-faint hover:text-fg">
          +{hidden} more
        </button>
      {/if}
      {#if editable && adding}
        <input
          use:autofocus
          bind:value={email}
          type="email"
          inputmode="email"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              invite();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              adding = false;
            }
          }}
          onblur={() => {
            invite();
            adding = false;
          }}
          placeholder="Invite by email"
          aria-label="Invite by email"
          autocomplete="off"
          spellcheck="false"
          class="t-body mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-fg
            placeholder:text-fg-faint focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
        />
      {:else if editable}
        <button
          type="button"
          onclick={() => (adding = true)}
          class="press-sm t-micro flex items-center gap-1 rounded-md py-0.5 text-fg-faint hover:text-fg"
        >
          <Plus size={12} />
          Invite
        </button>
      {/if}
      {#if answer}{@render answer()}{/if}
    </div>
  </div>
{/if}
