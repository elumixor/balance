<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { CategoryIcon } from "$lib/components";
  import { openExternal } from "$lib/desktop/open";
  import { decodeReminder, type ReminderCard } from "$lib/desktop/reminder";
  import { formatClock, formatHoursAndMinutes } from "$lib/ui/format";
  import type { TravelMode } from "$lib/account/preferences-types";
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

  /** The button under the pointer, so a tick plays once on arrival rather than on every move. */
  let hovered: Element | null = null;

  /** A tick on the trackpad as the pointer lands on something pressable. */
  function feel(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (target === hovered) return;
    hovered = target;
    if (target) void invoke("perform_haptic");
  }

  function close() {
    void invoke("close_reminder");
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
  <div
    bind:this={root}
    role="presentation"
    onpointerover={feel}
    onpointerleave={() => (hovered = null)}
    class="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-float">
    <div class="flex items-start gap-3">
      <CategoryIcon icon={card.icon} color={card.color} size={36} />
      <div class="min-w-0 flex-1">
        <p class="t-body-strong truncate">{card.title}</p>
        <p class="t-micro text-fg-muted">
          {card.kind === "leave" ? "Time to leave" : "Starts"}
          {until} · {formatClock(new Date(card.start))}–{formatClock(new Date(card.end))}
        </p>
      </div>
      {#if card.join}
        <button
          type="button"
          aria-label="Join {card.join.label}"
          class="press-sm rounded-md p-1.5 transition-colors hover:bg-surface-alt"
          onclick={() => open(card?.join?.url ?? "")}
        >
          <Video size={16} />
        </button>
      {/if}
      <button type="button" aria-label="Dismiss" class="press-sm rounded-md p-1 transition-colors hover:bg-surface-alt" onclick={close}>
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
            class="press-sm flex items-center gap-1.5 rounded-md border border-line px-2 py-1 transition-colors hover:border-line-strong hover:bg-surface-alt"
            onclick={() => open(leg.url)}
          >
            <ModeIcon size={14} class="text-fg-muted" />
            <span class="t-data-micro">{formatHoursAndMinutes(leg.seconds / 3600)}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if card.links.length > 0}
      <div class="flex flex-wrap items-center gap-2">
        {#each card.links as link (link.url)}
          <button
            type="button"
            class="press-sm flex items-center gap-1.5 rounded-md border border-line px-2 py-2 transition-colors hover:border-line-strong hover:bg-surface-alt"
            onclick={() => open(link.url)}
          >
            <Link2 size={14} class="text-fg-muted" />
            <span class="t-label max-w-28 truncate">{link.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The window is the card: no page around it, and nothing to scroll. */
  :global(html, body) {
    background: transparent;
    overflow: hidden;
  }
</style>
