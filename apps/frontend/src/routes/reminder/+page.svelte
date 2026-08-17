<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { emit } from "@tauri-apps/api/event";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import { openExternal } from "$lib/desktop/open";
  import { decodeReminder, type ReminderCard } from "$lib/desktop/reminder";
  import { formatClock, formatHoursAndMinutes } from "$lib/format";
  import type { TravelMode } from "$lib/preferences.svelte";
  import { Bike, Bus, Car, Footprints, Link2, MapPin, Video, X } from "lucide-svelte";

  /**
   * The reminder card: its own small window, floating in the corner of whatever you're doing.
   *
   * It has no session and asks the server nothing — everything on it arrived in the URL from the
   * window that scheduled it (see `lib/desktop/reminders.svelte.ts`). That keeps the card instant,
   * and keeps one idea of what an event counts as instead of two.
   */

  /** Nobody wants yesterday's reminder still on screen. */
  const LIFETIME_MS = 10 * 60_000;

  const MODE_ICONS: Record<TravelMode, typeof Bus> = {
    transit: Bus,
    drive: Car,
    bicycle: Bike,
    walk: Footprints,
  };

  let card = $state<ReminderCard | null>(null);
  let now = $state(new Date());
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    card = decodeReminder(new URLSearchParams(window.location.search).get("r"));
  });

  $effect(() => {
    const tick = setInterval(() => (now = new Date()), 15_000);
    const life = setTimeout(close, LIFETIME_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(life);
    };
  });

  // The window is built at a guessed height; this is the card saying what it actually came out at.
  $effect(() => {
    const element = root;
    if (!element || !card) return;
    const observer = new ResizeObserver(() => {
      void invoke("resize_reminder", { height: Math.ceil(element.getBoundingClientRect().height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  });

  const until = $derived.by(() => {
    if (!card) return "";
    const minutes = (new Date(card.start).getTime() - now.getTime()) / 60_000;
    if (minutes <= 0) return "now";
    return `in ${formatHoursAndMinutes(minutes / 60)}`;
  });

  function close() {
    void invoke("close_reminder");
  }

  function snooze() {
    if (card) void emit("reminder://snooze", { id: card.id, kind: card.kind });
    close();
  }

  /** Opened in the browser rather than in here: this window is a card, not a place to work. */
  async function open(url: string) {
    try {
      await openExternal(url);
    } finally {
      // Whether or not the link opened, the card has been acted on and has said its piece.
      close();
    }
  }
</script>

<svelte:head><title>Reminder</title></svelte:head>

{#if card}
  {@const Icon = card.join ? Video : MapPin}
  <div bind:this={root} class="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-float">
    <div class="flex items-start gap-3">
      <CategoryIcon icon={card.icon} color={card.color} size={36} />
      <div class="min-w-0 flex-1">
        <p class="t-body-strong truncate">{card.title}</p>
        <p class="t-micro text-fg-muted">
          {card.kind === "leave" ? "Time to leave" : "Starts"}
          {until} · {formatClock(new Date(card.start))}–{formatClock(new Date(card.end))}
        </p>
      </div>
      <button type="button" aria-label="Dismiss" class="press-sm rounded-md p-1" onclick={close}>
        <X size={16} class="text-fg-muted" />
      </button>
    </div>

    {#if card.location}
      <p class="t-micro flex items-center gap-2 text-fg-muted">
        <Icon size={14} class="shrink-0 text-fg-faint" />
        <span class="truncate">{card.location}</span>
      </p>
    {/if}

    {#if card.travel.length > 0}
      <!-- How long each way of getting there takes, in the order they were asked for; each one
           opens the route rather than telling you to look it up. -->
      <div class="flex flex-wrap items-center gap-2">
        {#each card.travel as leg (leg.mode)}
          {@const ModeIcon = MODE_ICONS[leg.mode]}
          <button
            type="button"
            class="press-sm flex items-center gap-1.5 rounded-md border border-line px-2 py-1"
            onclick={() => open(leg.url)}
          >
            <ModeIcon size={14} class="text-fg-muted" />
            <span class="t-data-micro">{formatHoursAndMinutes(leg.seconds / 3600)}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="flex items-center gap-2">
      {#if card.join}
        <button
          type="button"
          class="press flex flex-1 items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-ink-fg"
          onclick={() => open(card?.join?.url ?? "")}
        >
          <Video size={15} />
          <span class="t-label">Join {card.join.label}</span>
        </button>
      {/if}
      {#each card.links as link (link.url)}
        <button
          type="button"
          class="press-sm flex items-center gap-1.5 rounded-md border border-line px-2 py-2"
          onclick={() => open(link.url)}
        >
          <Link2 size={14} class="text-fg-muted" />
          <span class="t-label max-w-28 truncate">{link.label}</span>
        </button>
      {/each}
      <button type="button" class="press-sm rounded-md border border-line px-3 py-2" onclick={snooze}>
        <span class="t-label">Snooze</span>
      </button>
    </div>
  </div>
{/if}

<style>
  /* The window is the card: no page around it, and nothing to scroll. */
  :global(html, body) {
    background: transparent;
    overflow: hidden;
  }
</style>
