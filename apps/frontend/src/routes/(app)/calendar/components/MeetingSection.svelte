<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import { asGoogleAccount, hasAddress, type Meeting } from "$lib/calendar/meeting";
  import type { CalendarEvent } from "$lib/calendar/types";
  import ConferencingRow from "./ConferencingRow.svelte";
  import LocationRow from "./LocationRow.svelte";
  import ParticipantsRow from "./ParticipantsRow.svelte";
  import RsvpControl from "./RsvpControl.svelte";

  /** The meeting inside the event: how you get in, who else is coming, where it is. */
  let {
    event,
    draft,
    /** Where the meeting is and how you get into it, read the same way the reminder card reads it. */
    meeting,
    /** Whose calendar this came from: what tells a Google link which signed-in account to open as. */
    accountEmail,
    conferencing,
    participants,
    location,
    onopen,
  }: {
    event: CalendarEvent;
    draft: EventDraft;
    meeting: Meeting;
    accountEmail: string | null;
    conferencing: boolean;
    participants: boolean;
    location: boolean;
    onopen: (url: string) => void;
  } = $props();

  const data = calendarData;

  const editable = $derived(draft.editable);
  /** The link the Join button actually opens, pointed at the account that was invited. */
  const joinUrl = $derived(meeting.join ? asGoogleAccount(meeting.join.url, accountEmail) : null);
  /**
   * The address travel times are worked out to, or null. A room name or a link is nowhere to
   * travel to. Where the journey *starts* is the picker's business — it can always answer, if
   * only with the device's own position, so it is offered wherever there is an address.
   */
  const travelTo = $derived(hasAddress(event) ? meeting.location : null);
  /** A guest list is the organizer's to keep; an invitation you received isn't yours to change. */
  const hosting = $derived(editable && (!event.organizer || event.organizer.self));
  /**
   * An all-day invitation is still an invitation, so this isn't `editable` — but a calendar you
   * only have read access to won't take an answer either, and offering one would only fail.
   */
  const answerable = $derived(event.invited && !event.readOnly);

  function chooseLocation(location: string) {
    void draft.write("The location wasn’t saved", data.patchEvent(event, { location }, { location: event.location ?? "" }));
  }

  function chooseGuests(attendees: { email: string; optional?: boolean }[]) {
    const before = event.attendees.flatMap((a) => (a.email ? [{ email: a.email, optional: a.optional }] : []));
    void draft.write("The guest list wasn’t saved", data.patchEvent(event, { attendees }, { attendees: before }));
  }

  function addCall() {
    void draft.write("The call wasn’t added", data.patchEvent(event, { conference: "create" }, { conference: "remove" }));
  }

  function removeCall() {
    void draft.write("The call wasn’t removed", data.patchEvent(event, { conference: "remove" }, { conference: "create" }));
  }

</script>

<div class="border-t border-line px-2 py-1.5">
  {#if conferencing}
    <ConferencingRow
      {meeting}
      conferenceName={event.conferenceName}
      {joinUrl}
      {editable}
      onjoin={onopen}
      oncreate={addCall}
      onremove={removeCall}
      onpaste={(url) => draft.append(url)}
    />
  {/if}
  {#if participants}
    <ParticipantsRow attendees={event.attendees} organizer={event.organizer} editable={hosting} onchange={chooseGuests}>
      {#snippet answer()}
        {#if answerable}
          <RsvpControl {event} {draft} />
        {/if}
      {/snippet}
    </ParticipantsRow>
  {/if}
  {#if location}
    <LocationRow
      {event}
      location={meeting.location ?? event.location}
      {travelTo}
      {editable}
      onchange={chooseLocation}
      {onopen}
    />
  {/if}
</div>
