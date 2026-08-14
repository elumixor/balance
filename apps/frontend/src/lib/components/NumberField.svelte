<script lang="ts">
  /**
   * A quantity with its unit welded on: right-aligned mono digits, faint unit, no spinner.
   * The box belongs to the pair, not the input, so the unit sits inside the same outline the
   * digits get on focus.
   *
   * What's typed is kept as typed, not parsed, until Enter or focusout applies it — so "1." or a
   * half-finished expression like "7*" never collapses mid-keystroke. Escape drops it instead.
   */
  import { Parser } from "expr-eval";

  let {
    value,
    unit,
    ariaLabel,
    onchange,
    width = "w-11",
    inputmode = "decimal",
    size = "md",
  }: {
    value: number;
    unit: string;
    ariaLabel: string;
    onchange: (value: number) => void;
    /** Percentages need one more digit than hours. */
    width?: string;
    inputmode?: "numeric" | "decimal";
    /** "sm" is the readout as it sits in a ring callout, where a row of controls has no room. */
    size?: "md" | "sm";
  } = $props();

  const type = $derived(size === "sm" ? "t-data-micro" : "t-data");

  let typed = $state<string | null>(null);
  const shown = $derived(typed ?? String(value));

  const parser = new Parser();

  /** "7*7" resolves to 49 on commit, same path a plain number takes. */
  function evaluate(next: string) {
    try {
      const result = parser.evaluate(next);
      return typeof result === "number" && Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }

  /** Enter or clicking away applies what's typed; Escape drops it and shows `value` again. */
  function commit() {
    if (typed === null) return;
    const trimmed = typed.trim();
    typed = null;
    if (trimmed === "") return;
    const result = evaluate(trimmed);
    if (result !== null) onchange(result);
  }

  function keydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      typed = null;
      e.currentTarget.blur();
    }
  }
</script>

<span
  class="flex items-center rounded-md border border-transparent transition-[border-color,box-shadow]
    duration-150 hover:border-line focus-within:border-line-strong focus-within:ring-2 focus-within:ring-fg/10
    {size === 'sm' ? 'h-6 pr-1 pl-0.5' : 'h-9 pr-1.5 pl-1'}"
>
  <input
    {inputmode}
    autocomplete="off"
    aria-label={ariaLabel}
    value={shown}
    oninput={(e) => (typed = e.currentTarget.value)}
    onkeydown={keydown}
    onfocusout={commit}
    class="{type} {width} bg-transparent text-right text-fg focus:outline-none"
  />
  <span class="{type} pl-0.5 text-fg-faint">{unit}</span>
</span>
