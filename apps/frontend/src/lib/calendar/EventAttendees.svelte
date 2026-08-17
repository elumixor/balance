<script lang="ts">
  import Dot from "$lib/components/Dot.svelte";
  import type { EventAttendee, EventResponse } from "$lib/types";
  import { Users } from "lucide-svelte";

  /**
   * Who else is coming. A guest list is read at a glance rather than studied, so each line is a
   * name and a dot saying what they answered — and a long list is cut off, because the point is
   * whether the meeting is happening, not who the fortieth invitee is.
   */
  let { attendees, organizer }: { attendees: EventAttendee[]; organizer: EventAttendee | null } = $props();

  /** Past this many the list stops being a glance and starts being a page. */
  const SHOWN = 5;

  const RESPONSE_COLORS: Record<EventResponse, string> = {
    accepted: "var(--positive)",
    declined: "var(--danger)",
    tentative: "var(--caution)",
    needsAction: "var(--line-strong)",
  };

  /**
   * The organizer is on their own guest list, and shouldn't be on it twice — matched on the one
   * thing a guest is guaranteed to have, since an invitation can carry a nameless address or an
   * address-less name.
   */
  const guests = $derived(attendees.filter((a) => !organizer || !sameAs(a, organizer)));
  const listed = $derived(guests.slice(0, SHOWN));
  const hidden = $derived(guests.length - listed.length);

  function sameAs(a: EventAttendee, b: EventAttendee) {
    if (a.email && b.email) return a.email === b.email;
    return Boolean(a.name) && a.name === b.name;
  }

  function nameOf(attendee: EventAttendee) {
    return attendee.name ?? attendee.email ?? "Guest";
  }
</script>

<div class="flex w-full items-start gap-3 py-1.5">
  <Users size={16} class="mt-0.5 shrink-0 text-fg-faint" />
  <div class="min-w-0 flex-1 space-y-1">
    {#if organizer}
      <div class="flex items-center gap-2">
        <Dot color={RESPONSE_COLORS[organizer.response]} size={6} />
        <span class="t-label truncate">{nameOf(organizer)}</span>
        <span class="t-micro shrink-0 text-fg-faint">organizer</span>
      </div>
    {/if}
    {#each listed as attendee, i (attendee.email ?? attendee.name ?? i)}
      <div class="flex items-center gap-2">
        <Dot color={RESPONSE_COLORS[attendee.response]} size={6} />
        <span class="t-label truncate text-fg-muted">{nameOf(attendee)}</span>
        {#if attendee.optional}<span class="t-micro shrink-0 text-fg-faint">optional</span>{/if}
      </div>
    {/each}
    {#if hidden > 0}
      <p class="t-micro pl-4 text-fg-faint">+{hidden} more</p>
    {/if}
  </div>
</div>
