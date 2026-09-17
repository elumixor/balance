<script lang="ts">
  import { CardRow, Dot, Tooltip } from "$lib/components";
  import ComboField, { type ComboOption } from "$lib/components/ComboField.svelte";
  import { type KnownPerson, suggestPeople } from "$lib/calendar/contacts";
  import type { EventAttendee, EventResponse } from "$lib/calendar/types";
  import { store } from "$lib/core/store.svelte";
  import { Crown, Plus, Users, X } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import OrganizerPicker from "./OrganizerPicker.svelte";

  /**
   * Who else is coming, and what they said. A line per guest with a dot for their answer, the
   * organizer first; an address typed under the list invites one more, and the cross beside a
   * guest uninvites them — both only on an event you organize, since a guest list is the
   * organizer's to keep. What is typed there is answered by everyone the account already knows —
   * met on a recent event, or in its address book — so a colleague is a keystroke and a pick
   * rather than an address spelled out from memory; a stranger is still simply typed in full.
   */
  let {
    attendees,
    organizer,
    editable,
    calendarId,
    onchange,
    onhost,
    answer,
  }: {
    attendees: EventAttendee[];
    organizer: EventAttendee | null;
    /** Whether this is your event to invite people to. */
    editable: boolean;
    /** The calendar hosting it, so the picker under the organizer's name knows what is ticked. */
    calendarId: string;
    onchange: (attendees: { email: string; optional?: boolean }[]) => void;
    /** Hands the event to another calendar. Absent on an event that isn't yours to hand over. */
    onhost?: (calendarId: string) => void;
    /** Your own RSVP, drawn at the end of your line — only when there is one to give. */
    answer?: Snippet;
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

  // The directory is fetched once a session, not once a card: opening the field on an answer that
  // hasn't arrived yet is the one state a suggestion list can't usefully have.
  $effect(() => {
    if (editable) void store.contacts.ensure();
  });

  const known = $derived(store.contacts.value ?? []);
  const invited = $derived(attendees.flatMap((a) => (a.email ? [a.email] : [])));
  const suggestions = $derived(
    suggestPeople(known, email, invited).map(
      (person): ComboOption<KnownPerson> => ({
        key: person.email,
        label: person.name ?? person.email,
        hint: person.name ? person.email : undefined,
        value: person,
      }),
    ),
  );

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

  function invite(typed: string) {
    const address = typed.trim();
    email = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return;
    if (attendees.some((a) => a.email?.toLowerCase() === address.toLowerCase())) return;
    onchange([...list(), { email: address }]);
  }

  function uninvite(attendee: EventAttendee) {
    onchange(list().filter((a) => a.email !== attendee.email));
  }

</script>

{#snippet inviteField()}
  <!-- Blur closes the field, and a pick doesn't blur it: the list keeps focus where it is, so
       several people can be invited one after another without reopening anything. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="min-w-0 flex-1"
    onfocusout={(e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      invite(email);
      adding = false;
    }}
    onkeydown={(e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      email = "";
      adding = false;
    }}
  >
    <ComboField
      bind:value={email}
      options={suggestions}
      autofocus
      variant="bare"
      width="anchor"
      placeholder="Invite by email"
      ariaLabel="Invite by email"
      onpick={(option) => {
        invite(option.value.email);
      }}
      onfree={(text) => invite(text)}
    />
  </div>
{/snippet}

{#if empty && !editable}
  <CardRow icon={Users} label="No guests" />
{:else if empty && !adding}
  <CardRow icon={Users} label="Participants" onclick={() => (adding = true)} />
{:else if empty}
  <CardRow icon={Users}>
    {@render inviteField()}
  </CardRow>
{:else}
  <CardRow icon={Users} set align="start">
    <div class="min-w-0 flex-1 space-y-1 py-1">
      {#if organizer}
        <div class="flex items-center gap-2">
          <Dot color={RESPONSE_COLORS[organizer.response]} size={6} />
          {#if onhost}
            <OrganizerPicker {calendarId} label={nameOf(organizer)} onchoose={onhost} />
          {:else}
            <span class="t-label min-w-0 truncate">{nameOf(organizer)}</span>
          {/if}
          <Tooltip label="Organizer">
            <span class="flex shrink-0 text-fg-faint" aria-label="Organizer"><Crown size={12} /></span>
          </Tooltip>
          {#if organizer.self && answer}{@render answer()}{/if}
        </div>
      {/if}
      {#each listed as attendee, i (attendee.email ?? attendee.name ?? i)}
        <div class="group flex items-center gap-2">
          <Dot color={RESPONSE_COLORS[attendee.response]} size={6} />
          <span class="t-label min-w-0 flex-1 truncate text-fg-muted">{nameOf(attendee)}</span>
          {#if attendee.optional}<span class="t-micro shrink-0 text-fg-faint">optional</span>{/if}
          {#if attendee.self && answer}{@render answer()}{/if}
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
        {@render inviteField()}
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
    </div>
  </CardRow>
{/if}
