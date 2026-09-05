<script lang="ts">
  import { followAnchor, layer, MENU_MAX_HEIGHT, placeMenu, type FloatPosition } from "$lib/components/float";
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
    /** A time settled on rather than typed toward: it goes to the calendar without waiting. */
    oncommit,
    /** The time the field is pointing at, or null when it's shut: what taking it would mean. */
    onpreview,
    ariaLabel,
  }: {
    value: string;
    counterpart: string;
    end?: boolean;
    oninput?: (value: string) => void;
    oncommit?: () => void;
    onpreview?: (value: string | null) => void;
    ariaLabel: string;
  } = $props();

  const STEP_MINUTES = 15;
  /** A full day of quarter hours, so a block can be given any length without leaving the list. */
  const SLOTS = 96;
  const MENU_WIDTH = 190;

  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let open = $state(false);
  let highlighted = $state(0);
  let position = $state<FloatPosition | null>(null);
  /** The time the field is currently arguing for: typed, or walked to in the list. */
  let candidate = $state<string | null>(null);
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

  function place() {
    if (input) position = placeMenu(input, MENU_WIDTH);
  }

  function show() {
    fallback = normalize(value) ?? fallback;
    candidate = fallback;
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
    candidate = clock;
    oninput?.(clock);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    set(option.clock);
    open = false;
    oncommit?.();
  }

  /** What's typed either reads as a time, in which case it's tidied up, or it goes back. */
  function settle() {
    const clock = normalize(value);
    if (clock !== value) set(clock ?? fallback);
    oncommit?.();
  }

  function move(delta: number) {
    highlighted = Math.min(options.length - 1, Math.max(0, highlighted + delta));
    candidate = options[highlighted]?.clock ?? candidate;
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

  // Whatever the field is pointing at is drawn on the grid before it's taken, and stops being
  // drawn the moment the field is done — by then the value itself says what the event is.
  $effect(() => {
    onpreview?.(open ? candidate : null);
  });

  $effect(() => () => onpreview?.(null));

  // The field can move under the list — the card re-places itself as its content grows.
  $effect(() => {
    if (open) return followAnchor(place);
  });
</script>

<!-- The box is the field: the input holds the time, the span sits beside it inside the same border. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerdown={focus}
  class="field-bare flex shrink-0 items-center gap-2"
>
  <input
    bind:this={input}
    bind:value
    oninput={(e) => {
      // Half-typed text is nobody's business but this field's — only a real time is passed on,
      // and the grid keeps drawing the last readable one until another arrives.
      const clock = normalize(e.currentTarget.value);
      candidate = clock ?? fallback;
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
    class="w-11 bg-transparent outline-none"
  />
  <!-- The span belongs to one field, not both: saying it twice in one row says nothing extra. -->
  {#if end && span}
    <span class="shrink-0 text-fg-faint">{span}</span>
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
    class="menu float-in fixed z-50"
    style="left:{position.left}px;top:{position.top}px;width:{MENU_WIDTH}px;max-height:{MENU_MAX_HEIGHT}px"
  >
    {#each options as option, i (option.clock + i)}
      <li>
        <button
          type="button"
          onclick={() => choose(i)}
          class="menu-row {i === highlighted ? 'bg-surface-alt' : ''}"
        >
          <span>{option.clock}</span>
          <span class="text-fg-faint">{option.span}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}
