<script lang="ts">
  import { calendarData, ensureZoom } from "$lib/calendar/calendar-data.svelte";
  import { store } from "$lib/core/store.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import { asGoogleAccount, callFrom, hasAddress, type Meeting } from "$lib/calendar/meeting";
  import type { CalendarEvent } from "$lib/calendar/types";
  import ConferencingRow from "./ConferencingRow.svelte";
  import EndPlaceRow from "./EndPlaceRow.svelte";
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

  /**
   * Whether making a Zoom room is worth offering: only a deployment with a Zoom app of its own
   * can, and until somebody has connected an account the offer is the thing that connects it.
   */
  const zoomOffer = $derived(store.zoom.value?.available ?? false);

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

  /** Where it leaves you: the app's own record, so it is written like a practice tag. */
  function chooseEndPlace(endLocation: string | null) {
    void draft.write("The end place wasn’t saved", data.tagEvent(event, { endLocation }));
  }

  function chooseGuests(attendees: { email: string; optional?: boolean }[]) {
    const before = event.attendees.flatMap((a) => (a.email ? [{ email: a.email, optional: a.optional }] : []));
    void draft.write("The guest list wasn’t saved", data.patchEvent(event, { attendees }, { attendees: before }));
  }

  /**
   * Whose event it is: handing it to another calendar is what the calendar means by changing the
   * organizer, so the name at the top of the guest list is the picker for it.
   */
  function chooseHost(calendarId: string) {
    void draft.write("The organizer wasn’t changed", data.moveEventToCalendar(event, calendarId));
  }

  /**
   * A Zoom room, made in the connected account. Nothing asks anybody to go and connect Zoom
   * first: the grant is asked for at the moment it is needed and the room is made straight
   * after, so nobody is sent off on an errand first.
   */
  async function addZoomCall() {
    if (!(await ensureZoom())) return;
    void draft.write("The Zoom room wasn’t made", data.patchEvent(event, { conference: "zoom" }, { conference: "remove" }));
  }

  function addCall() {
    void draft.write("The call wasn’t added", data.patchEvent(event, { conference: "create" }, { conference: "remove" }));
  }

  function removeCall() {
    void draft.write("The call wasn’t removed", data.patchEvent(event, { conference: "remove" }, { conference: "create" }));
  }

  /**
   * A Zoom or Teams link becomes the event's own call rather than a line in the notes: it is
   * written into the conferencing block every calendar draws a join button from, so the people
   * invited see it where they look for it. Undo puts back whatever call was there before.
   */
  function pasteCall(url: string) {
    const was = event.conferenceUrl
      ? { url: event.conferenceUrl, name: event.conferenceName ?? "Video call" }
      : ("remove" as const);
    void draft.write("The call wasn’t saved", data.patchEvent(event, { conference: callFrom(url) }, { conference: was }));
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
      onzoom={() => void addZoomCall()}
      zoom={zoomOffer}
      onremove={removeCall}
      onpaste={pasteCall}
      hasCall={Boolean(event.conferenceUrl)}
    />
  {/if}
  {#if participants}
    <ParticipantsRow
      attendees={event.attendees}
      organizer={event.organizer}
      editable={hosting}
      calendarId={event.calendarId}
      onchange={chooseGuests}
      onhost={hosting ? chooseHost : undefined}
    >
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
    <EndPlaceRow {event} endLocation={event.endLocation} onchange={chooseEndPlace} />
  {/if}
</div>
