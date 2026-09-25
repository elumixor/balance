<script lang="ts">
  import { Avatar, CardRow, CopyButton, PersonField, Tooltip } from "$lib/components";
  import type { EventAttendee, EventResponse } from "$lib/calendar/types";
  import { peopleDirectory } from "$lib/people/directory.svelte";
  import type { Person } from "$lib/people/types";
  import { Crown, Plus, Users, X } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import OrganizerPicker from "./OrganizerPicker.svelte";

  /**
   * Who else is coming, and what they said. A line per guest — their face, ringed in the colour
   * of their answer, and the name the people list knows them by — the organizer first; an address typed under the list invites one more, and the cross beside a
   * guest uninvites them — both only on an event you organize, since a guest list is the
   * organizer's to keep. The field under the list is the app's one person field: everyone the
   * account knows, by name or address, and a stranger typed in full joins the list for next time.
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
  let expanded = $state(false);

  const invited = $derived(attendees.flatMap((a) => (a.email ? [a.email] : [])));

  const guests = $derived(attendees.filter((a) => !organizer || !sameAs(a, organizer)));
  const listed = $derived(expanded ? guests : guests.slice(0, SHOWN));
  const hidden = $derived(guests.length - listed.length);
  const empty = $derived(!organizer && guests.length === 0);

  function sameAs(a: EventAttendee, b: EventAttendee) {
    if (a.email && b.email) return a.email === b.email;
    return Boolean(a.name) && a.name === b.name;
  }

  const nameOf = (attendee: EventAttendee) => personOf(attendee).name;

  /** A face for the line: the people list's row for the address, or the guest as the calendar sends them. */
  function personOf(attendee: EventAttendee): Person {
    const known = attendee.email ? peopleDirectory.byEmail(attendee.email) : null;
    if (known) return known;
    return {
      id: attendee.email ?? attendee.name ?? "guest",
      name: attendee.name ?? attendee.email ?? "Guest",
      email: attendee.email,
      color: "#8b8b8b",
      avatar: null,
    };
  }

  /** Everyone with an address, as the calendar takes a list — rooms and the nameless have none. */
  const list = () => attendees.flatMap((a) => (a.email ? [{ email: a.email, optional: a.optional }] : []));

  function invite(person: Person) {
    const address = person.email;
    if (!address || attendees.some((a) => a.email?.toLowerCase() === address.toLowerCase())) return;
    onchange([...list(), { email: address }]);
  }

  function uninvite(attendee: EventAttendee) {
    onchange(list().filter((a) => a.email !== attendee.email));
  }

</script>

{#snippet face(attendee: EventAttendee)}
  <span class="inline-flex shrink-0 rounded-full ring-2" style="--tw-ring-color:{RESPONSE_COLORS[attendee.response]}">
    <Avatar person={personOf(attendee)} size={18} />
  </span>
{/snippet}

{#snippet copyEmail(attendee: EventAttendee)}
  {#if attendee.email}
    <span class="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
      <CopyButton text={() => attendee.email ?? ""} label="Copy {attendee.email}" size={12} class="p-0.5" />
    </span>
  {/if}
{/snippet}

{#snippet inviteField()}
  <!-- Leaving the field closes it, and a pick doesn't: the list keeps focus where it is, so
       several people can be invited one after another without reopening anything. -->
  <PersonField
    taken={invited}
    emailOnly
    autofocus
    placeholder="Invite by name or email"
    onpick={invite}
    ondone={() => (adding = false)}
  />
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
        <div class="group flex items-center gap-2">
          {@render face(organizer)}
          {#if onhost}
            <OrganizerPicker {calendarId} label={nameOf(organizer)} onchoose={onhost} />
          {:else}
            <span class="t-label min-w-0 truncate">{nameOf(organizer)}</span>
          {/if}
          <Tooltip label="Organizer">
            <span class="flex shrink-0 text-fg-faint" aria-label="Organizer"><Crown size={12} /></span>
          </Tooltip>
          <span class="flex-1"></span>
          {#if organizer.self && answer}{@render answer()}{/if}
          {@render copyEmail(organizer)}
        </div>
      {/if}
      {#each listed as attendee, i (attendee.email ?? attendee.name ?? i)}
        <div class="group flex items-center gap-2">
          {@render face(attendee)}
          <span class="t-label min-w-0 flex-1 truncate text-fg-muted">{nameOf(attendee)}</span>
          {#if attendee.optional}<span class="t-micro shrink-0 text-fg-faint">optional</span>{/if}
          {#if attendee.self && answer}{@render answer()}{/if}
          {@render copyEmail(attendee)}
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
        <button type="button" onclick={() => (expanded = true)} class="t-micro pl-7 text-fg-faint hover:text-fg">
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
