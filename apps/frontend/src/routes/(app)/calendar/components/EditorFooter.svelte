<script lang="ts">
  import { FEEDS } from "$lib/integrations/integrations.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";

  /** The foot: what's linked into the block, and why its hours count toward nothing when they don't. */
  let { event }: { event: CalendarEvent } = $props();

  /** The feed this block is linked to, and the integration it belongs to — for the card's section. */
  const linked = $derived(event.source ? (FEEDS.get(event.source) ?? null) : null);
</script>

{#if linked}
  {@const Section = linked.feed.section}
  <div class="border-t border-line px-2 py-1.5">
    <Section {event} />
  </div>
{/if}

{#if !event.countsTowardHours}
  <p class="t-micro border-t border-line px-3 py-2 text-fg-faint">
    {event.declined ? "You declined this, so it counts toward nothing." : "All-day events don't count as hours."}
  </p>
{/if}
