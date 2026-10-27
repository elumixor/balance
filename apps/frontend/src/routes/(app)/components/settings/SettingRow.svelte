<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import type { Component, Snippet } from "svelte";

  /**
   * One line of settings: a glyph, the words, and at the far end the control.
   *
   * The same shape as a row of the event card, so the panel reads as one column of glyphs with
   * one column of words beside it, and a switch, a time, a trash can and a Connect button all sit
   * on the same vertical line.
   *
   * One rule for the pointer: the whole row lights up, and the words are the control's own label.
   * Pressing them does what the row is for — `onclick` when it has one, otherwise the first
   * control at the far end: a switch flips, a select opens, a field takes the caret. So a row
   * with a switch and a row with a time answer the same press the same way. A row that leads
   * nowhere — a version line with three roads beside it — says so with `flat`.
   */
  let {
    icon,
    label,
    /** One faint line where the label alone doesn't say enough. Most rows need none; a snippet
     *  for the rare line with a hover or a link in it. */
    note,
    /** Dimmed and inert for a setting that only means something when another one is on. */
    disabled = false,
    /** The words lead nowhere: no ground under the pointer, no forwarding. */
    flat = false,
    onclick,
    children,
  }: {
    /** A lucide glyph, or any small mark drawn the same way — an integration's own, say. */
    icon?: typeof IconType | Component<{ size?: number; class?: string }>;
    label: string;
    note?: string | Snippet;
    disabled?: boolean;
    flat?: boolean;
    onclick?: () => void;
    children?: Snippet;
  } = $props();

  const CONTROL = "input, button, select, textarea, [tabindex]";

  let controls = $state<HTMLElement | null>(null);

  const Icon = $derived(icon);
  const interactive = $derived(!flat && !disabled);

  /** A press on the words, or on the row's empty ground; a press on the control is its own. */
  function press(e: MouseEvent) {
    if (controls?.contains(e.target as Node)) return;
    if (onclick) return onclick();
    const control = controls?.querySelector<HTMLElement>(CONTROL);
    if (!control) return;
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      control.focus();
      control.select();
    } else {
      control.click();
    }
  }
</script>

{#snippet words()}
  <span class="flex size-7 shrink-0 items-center justify-center text-fg-muted">
    {#if Icon}<Icon size={16} />{/if}
  </span>
  <span class="min-w-0 flex-1">
    <span class="t-label block truncate text-fg">{label}</span>
    {#if typeof note === "function"}
      <span class="t-micro block text-fg-faint">{@render note()}</span>
    {:else if note}
      <span class="t-micro block text-fg-faint">{note}</span>
    {/if}
  </span>
{/snippet}

<!-- The row is a label, not a button: the control inside is the focus stop, and a button inside
     a button is not allowed. -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  onclick={interactive ? press : undefined}
  class="flex min-h-9 items-center gap-3 rounded-md px-1.5 py-1 {disabled ? 'pointer-events-none opacity-40' : ''}
    {interactive ? 'hoverable cursor-pointer' : ''}"
>
  {@render words()}
  {#if children}
    <span bind:this={controls} class="flex shrink-0 items-center gap-2">{@render children()}</span>
  {/if}
</div>
