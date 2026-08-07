<script lang="ts">
  import Field from "./Field.svelte";

  /** A quantity with its unit welded on: right-aligned mono digits, faint unit, no spinner. */
  let {
    value,
    unit,
    ariaLabel,
    onchange,
    inputmode = "decimal",
  }: {
    value: number;
    unit: string;
    ariaLabel: string;
    onchange: (value: number) => void;
    inputmode?: "numeric" | "decimal";
  } = $props();
</script>

<span class="flex items-center">
  <Field
    variant="inline"
    mono
    align="right"
    {inputmode}
    {ariaLabel}
    value={String(value)}
    oninput={(next) => {
      const parsed = Number(next);
      if (!Number.isNaN(parsed)) onchange(parsed);
    }}
    class="w-11"
  />
  <span class="t-data text-fg-faint">{unit}</span>
</span>
