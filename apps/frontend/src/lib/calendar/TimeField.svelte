<script lang="ts">
  import { formatHoursAndMinutes } from "$lib/format";

  /**
   * One end of an event, entered the way a calendar lets you enter it: the field carries the span
   * the event makes beside the time itself, and pressing it offers every quarter hour with the
   * span each one would mean. Arrow keys walk the list, Enter takes one.
   *
   * Both ends use this, so a duration can be given from either side: picking in the start field
   * moves the start and leaves the end where it is, and picking in the end field does the reverse.
   */
  let {
    value = $bindable(""),
    /** The other end of the same event, as "HH:MM" — every suggestion is measured from it. */
    counterpart,
    /** Which end this field is, which is to say which way the suggestions run from the other one. */
    end = false,
    oninput,
    ariaLabel,
  }: {
    value: string;
    counterpart: string;
    end?: boolean;
    oninput?: (value: string) => void;
    ariaLabel: string;
  } = $props();

  const STEP_MINUTES = 15;
  /** A full day of quarter hours, so a block can be given any length without leaving the list. */
  const SLOTS = 96;
  const MENU_WIDTH = 190;
  const MENU_MAX_HEIGHT = 280;
  const GAP = 6;
  const MARGIN = 12;

  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let open = $state(false);
  let highlighted = $state(0);
  let position = $state<{ left: number; top: number } | null>(null);
  /** What the field said when it was last agreed on, and what anything unreadable goes back to. */
  let fallback = "";

  const pad = (n: number) => n.toString().padStart(2, "0");

  /** "9", "930", "9:30", "9.30" — every way a time gets typed, as "09:30". Null when it isn't one. */
  function normalize(text: string) {
    const match = /^(\d{1,2})[:.]?(\d{2})?$/.exec(text.replace(/\s+/g, ""));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  /** Minutes since midnight, or null when the text isn't a time. */
  function toMinutes(text: string) {
    const clock = normalize(text);
    if (!clock) return null;
    return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  }

  function toClock(minutes: number) {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
  }

  /** A span in minutes, counting an event that runs past midnight as landing the next day. */
  function spanBetween(startMinutes: number, endMinutes: number) {
    const diff = endMinutes - startMinutes;
    return diff > 0 ? diff : diff + 1440;
  }

  const other = $derived(toMinutes(counterpart));

  /**
   * Every quarter hour on this side of the other end, in clock order: after it for an end field,
   * before it for a start field. Each row is labelled with the span it would make.
   */
  const options = $derived.by(() => {
    if (other === null) return [];
    return Array.from({ length: SLOTS }, (_, i) => {
      const minutes = (end ? i + 1 : SLOTS - i) * STEP_MINUTES;
      return { clock: toClock(other + (end ? minutes : -minutes)), span: formatHoursAndMinutes(minutes / 60) };
    });
  });

  /** The span the typed value makes, shown in the field so the number never needs working out. */
  const span = $derived.by(() => {
    const mine = toMinutes(value);
    if (other === null || mine === null) return "";
    return formatHoursAndMinutes(spanBetween(end ? other : mine, end ? mine : other) / 60);
  });

  /** Whatever's typed points somewhere in the list: its own row, or the nearest one to it. */
  function matchIndex() {
    const mine = toMinutes(value);
    if (other === null || mine === null) return end ? 0 : options.length - 1;
    const clock = normalize(value);
    const exact = options.findIndex((o) => o.clock === clock);
    if (exact >= 0) return exact;
    const slots = Math.ceil(spanBetween(end ? other : mine, end ? mine : other) / STEP_MINUTES);
    return Math.min(options.length - 1, Math.max(0, end ? slots - 1 : SLOTS - slots));
  }

  /** Below the field when the list fits there, above it otherwise. */
  function place() {
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const below = rect.bottom + GAP;
    const fitsBelow = below + MENU_MAX_HEIGHT <= window.innerHeight - MARGIN;
    position = {
      left: Math.min(Math.max(MARGIN, rect.left), window.innerWidth - MENU_WIDTH - MARGIN),
      top: fitsBelow ? below : Math.max(MARGIN, rect.top - GAP - MENU_MAX_HEIGHT),
    };
  }

  function show() {
    fallback = normalize(value) ?? fallback;
    highlighted = matchIndex();
    place();
    open = true;
  }

  /** Puts the caret in the field from anywhere in the box — the span beside it counts as the field. */
  function focus(e: PointerEvent) {
    if (e.target === input) return;
    e.preventDefault();
    input?.focus();
  }

  function set(clock: string) {
    value = clock;
    fallback = clock;
    oninput?.(clock);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    set(option.clock);
    open = false;
  }

  /** What's typed either reads as a time, in which case it's tidied up, or it goes back. */
  function settle() {
    const clock = normalize(value);
    if (clock !== value) set(clock ?? fallback);
  }

  function move(delta: number) {
    highlighted = Math.min(options.length - 1, Math.max(0, highlighted + delta));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
      else move(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!open) return;
    // Enter and Escape belong to the list while it's up: the card behind it handles both too, and
    // would otherwise save or close on the press that was meant to answer this field.
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      choose(highlighted);
      return;
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      set(fallback);
      open = false;
      return;
    }
    if (e.key === "Tab") settle();
  }

  // Typing walks the highlight along with it, so the list always points at what's been entered.
  $effect(() => {
    if (open) highlighted = matchIndex();
  });

  $effect(() => {
    if (!open) return;
    list?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  });

  // The field can move under the list — the card re-places itself as its content grows.
  $effect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  });

  /**
   * The list belongs to the page, not to the card that holds this field: left inside it, it would
   * be cut off by the card's own scrolling and placed against the card instead of the window.
   */
  function layer(node: HTMLElement) {
    document.body.appendChild(node);
    return () => node.remove();
  }
</script>

<!-- The box is the field: the input holds the time, the span sits beside it inside the same border. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerdown={focus}
  class="flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent px-2 transition-colors
    hover:border-line focus-within:border-line-strong focus-within:ring-2 focus-within:ring-fg/10"
>
  <input
    bind:this={input}
    bind:value
    oninput={(e) => {
      // Half-typed text is nobody's business but this field's — only a real time is passed on.
      const clock = normalize(e.currentTarget.value);
      if (clock) oninput?.(clock);
    }}
    onfocus={() => {
      input?.select();
      show();
    }}
    onblur={() => {
      settle();
      open = false;
    }}
    {onkeydown}
    aria-label={ariaLabel}
    autocomplete="off"
    autocapitalize="off"
    class="t-data w-11 bg-transparent text-fg outline-none"
  />
  <!-- The span belongs to one field, not both: saying it twice in one row says nothing extra. -->
  {#if end && span}
    <span class="t-data-micro shrink-0 text-fg-muted">{span}</span>
  {/if}
</div>

{#if open && position}
  <!-- Pressing a row must not blur the field first, or the list is gone before the press lands. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul
    {@attach layer}
    bind:this={list}
    data-popup-layer
    onpointerdown={(e) => e.preventDefault()}
    class="float-in fixed z-50 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-(--shadow-float)"
    style="left:{position.left}px;top:{position.top}px;width:{MENU_WIDTH}px;max-height:{MENU_MAX_HEIGHT}px"
  >
    {#each options as option, i (option.clock + i)}
      <li>
        <button
          type="button"
          onclick={() => choose(i)}
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hoverable
            {i === highlighted ? 'bg-surface-alt' : ''}"
        >
          <span class="t-data">{option.clock}</span>
          <span class="t-data-micro text-fg-muted">{option.span}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}
