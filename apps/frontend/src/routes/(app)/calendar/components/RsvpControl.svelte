<script lang="ts">
  import { type Answer, calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { EventDraft } from "$lib/calendar/event-draft.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { layer } from "$lib/components/float";
  import { Check, HelpCircle, X } from "lucide-svelte";
  import { tick } from "svelte";

  /**
   * The answer to an invitation: one icon with what was said, and, pointed at or focused, the
   * whole row of answers laid over it — slid so the answer already given stays exactly where it
   * rested. Only the guest list gets an answer to give, which is why this isn't an edit.
   */
  let { event, draft }: { event: CalendarEvent; draft: EventDraft } = $props();

  const data = calendarData;
  const ICON = 12;
  const RSVP: { value: Answer; label: string; icon: typeof Check }[] = [
    { value: "accepted", label: "Yes", icon: Check },
    { value: "tentative", label: "Maybe", icon: HelpCircle },
    { value: "declined", label: "No", icon: X },
  ];
  const UNANSWERED = RSVP[1];
  /** The answer on the card: what was said, or the question while nothing has been. */
  const said = $derived(RSVP.find((c) => c.value === event.response) ?? UNANSWERED);
  /** One icon and its padding, in px, so the open row can slide to put the answer over the closed one. */
  const RSVP_SLOT = 18;
  /** How far left the open row sits, so the icon already chosen lands exactly where it rested. */
  const shift = $derived(-RSVP.indexOf(said) * RSVP_SLOT);
  /** A moment's grace, so the pointer can cross from the chip onto the row laid over it. */
  const LEAVE_GRACE_MS = 80;

  /**
   * Where the closed chip is on screen while the row is open. The row is laid over it from the
   * body rather than in the line, because the card clips its own overflow and the chip is on its
   * right edge — the same reason a tooltip floats.
   */
  let at = $state<{ left: number; top: number } | null>(null);
  let leaving: ReturnType<typeof setTimeout> | null = null;
  let chip = $state<HTMLButtonElement | null>(null);
  let row = $state<HTMLElement | null>(null);

  function stay() {
    if (leaving) clearTimeout(leaving);
    leaving = null;
  }

  function open() {
    stay();
    const rect = chip?.getBoundingClientRect();
    if (rect) at = { left: rect.left, top: rect.top };
  }

  function leave() {
    leaving ??= setTimeout(() => {
      at = null;
      leaving = null;
    }, LEAVE_GRACE_MS);
  }

  function close() {
    stay();
    at = null;
  }

  const answers = () => Array.from(row?.querySelectorAll<HTMLButtonElement>("button") ?? []);

  /** Puts the keyboard on one of the answers, opening the row first when it's shut. */
  async function focusAnswer(index: number) {
    if (!at) open();
    await tick();
    const buttons = answers();
    buttons[Math.min(buttons.length - 1, Math.max(0, index))]?.focus();
  }

  /** Arrows walk from the chip onto the row, starting at the answer already given. */
  function onchipkeydown(e: KeyboardEvent) {
    const from = RSVP.indexOf(said);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "Enter" ? 0 : null;
    if (step === null) return;
    e.preventDefault();
    void focusAnswer(from + step);
  }

  /** Arrows walk the row from whichever answer has the keyboard; Escape puts it back on the chip. */
  function onrowkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      chip?.focus();
      return;
    }
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : null;
    if (step === null) return;
    e.preventDefault();
    const buttons = answers();
    const from = buttons.findIndex((b) => b === document.activeElement);
    void focusAnswer(from + step);
  }

  /**
   * Answering an invitation isn't an edit, so it doesn't go through the debounce — it's drawn and
   * queued the way every other write is, and ⌘Z takes it back like one.
   */
  function respond(response: Answer) {
    void draft.write("Your reply wasn’t saved", data.respondToEvent(event, response));
  }

  $effect(() => () => stay());
</script>

<!-- One icon with the answer given; pointed at, the whole row opens over it, slid so the given answer stays put. -->
<button
  bind:this={chip}
  type="button"
  aria-label="Reply: {event.response === 'needsAction' ? 'not yet' : said.label}"
  aria-haspopup="true"
  aria-expanded={Boolean(at)}
  class="chip-bare press-sm ml-auto shrink-0 px-1 {event.response === 'needsAction' ? 'text-fg-faint' : ''}"
  onpointerenter={open}
  onpointerleave={leave}
  onfocus={open}
  onblur={leave}
  onkeydown={onchipkeydown}
>
  <said.icon size={ICON} />
</button>
{#if at}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    {@attach layer}
    bind:this={row}
    role="group"
    aria-label="Reply"
    class="chip-bare fixed z-70 gap-0.5 px-1 whitespace-nowrap transition-[translate] duration-150"
    style="left:{at.left}px;top:{at.top}px;translate:{shift}px 0"
    onpointerenter={stay}
    onpointerleave={leave}
    onfocusin={stay}
    onfocusout={leave}
  >
    {#each RSVP as choice (choice.value)}
      {@const chosen = event.response === choice.value}
      <button
        type="button"
        aria-pressed={chosen}
        aria-label={choice.label}
        title={choice.label}
        class="press-sm rounded p-0.5 {chosen ? 'bg-ink text-ink-fg' : 'text-fg-faint hover:text-fg'}"
        onclick={() => respond(choice.value)}
        onkeydown={onrowkeydown}
      >
        <choice.icon size={ICON} />
      </button>
    {/each}
  </span>
{/if}
