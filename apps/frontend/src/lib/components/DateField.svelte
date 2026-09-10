<script lang="ts">
  import { viewport } from "$lib/platform/viewport.svelte";

  /**
   * A day, chosen the way the platform chooses days.
   *
   * A finger gets the native input outright — `showPicker` on a field nobody can see is a picker
   * that never opens. A pointer gets the app's own bare button reading "Fri 14 Aug", with the
   * native picker hidden behind it, so a row of dates looks like the rest of the card until the
   * moment somebody actually needs a calendar.
   */
  let {
    value,
    placeholder = "—",
    ariaLabel,
    onchange,
  }: { value: string | null; placeholder?: string; ariaLabel: string; onchange: (value: string | null) => void } =
    $props();

  let element = $state<HTMLInputElement>();

  const label = $derived(
    value
      ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : placeholder,
  );

  function open() {
    element?.showPicker?.();
  }
</script>

{#if viewport.touch}
  <input
    type="date"
    value={value ?? ""}
    onchange={(e) => onchange(e.currentTarget.value || null)}
    aria-label={ariaLabel}
    class="field-bare t-label shrink-0"
  />
{:else}
  <button type="button" onclick={open} class="field-bare press-sm t-label shrink-0 {value ? '' : 'text-fg-faint'}">
    {label}
  </button>
  <input
    bind:this={element}
    type="date"
    value={value ?? ""}
    oninput={(e) => onchange(e.currentTarget.value || null)}
    aria-label={ariaLabel}
    tabindex="-1"
    class="pointer-events-none absolute size-0 opacity-0"
  />
{/if}
