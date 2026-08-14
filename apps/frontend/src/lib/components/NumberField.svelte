<script lang="ts">
  /**
   * A quantity with its unit welded on: right-aligned mono digits, faint unit, no spinner.
   * The box belongs to the pair, not the input, so the unit sits inside the same outline the
   * digits get on focus.
   *
   * What's typed is kept as typed until it parses — otherwise "1." collapses to "1" mid-keystroke
   * and a decimal can never be entered.
   */
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

  function edit(next: string) {
    typed = next;
    const parsed = Number(next);
    if (next.trim() !== "" && !Number.isNaN(parsed)) onchange(parsed);
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
    oninput={(e) => edit(e.currentTarget.value)}
    onblur={() => (typed = null)}
    class="{type} {width} bg-transparent text-right text-fg focus:outline-none"
  />
  <span class="{type} pl-0.5 text-fg-faint">{unit}</span>
</span>
