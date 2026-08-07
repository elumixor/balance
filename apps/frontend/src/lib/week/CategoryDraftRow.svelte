<script lang="ts">
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import { X } from "lucide-svelte";
  import { fromUnit, toUnit, type Draft, type PlanUnit } from "./category-drafts.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  /** One editable row in the plan: colour swatch, name, share of the week, remove. */
  let {
    draft,
    taken,
    unit,
    onchange,
    onremove,
  }: {
    draft: Draft;
    taken: string[];
    unit: PlanUnit;
    onchange: (patch: Partial<Draft>) => void;
    onremove: () => void;
  } = $props();
</script>

<div class="flex items-center gap-2 py-2">
  <ColorPicker color={draft.color} {taken} onchange={(color) => onchange({ color })} />
  <Field
    variant="inline"
    value={draft.name}
    oninput={(name) => onchange({ name })}
    placeholder="Category name"
    autocapitalize="sentences"
    class="flex-1"
  />
  <NumberField
    value={toUnit(draft.hours, unit)}
    {unit}
    width={unit === "h" ? "w-11" : "w-12"}
    ariaLabel="{draft.name || 'New category'} {unit === 'h' ? 'hours' : 'share'}"
    onchange={(value) => onchange({ hours: fromUnit(value, unit) })}
  />
  <IconButton label="Remove {draft.name || 'category'}" tone="plain" onclick={onremove}>
    <X size={15} class="text-fg-faint" />
  </IconButton>
</div>
