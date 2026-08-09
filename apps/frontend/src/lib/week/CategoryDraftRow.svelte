<script lang="ts">
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import { X } from "lucide-svelte";
  import { fromUnit, toUnit, type Draft } from "./category-drafts.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  /**
   * One editable row in the plan: colour, name, and the same share written both ways — hours a
   * week and percent of the week. Either field takes an edit and the other follows, so a plan
   * thought of as "ten hours" and one thought of as "a fifteenth of my life" are the same plan.
   */
  let {
    draft,
    taken,
    onchange,
    onremove,
  }: {
    draft: Draft;
    taken: string[];
    onchange: (patch: Partial<Draft>) => void;
    onremove: () => void;
  } = $props();

  const name = $derived(draft.name || "New category");
</script>

<div class="flex items-center gap-2 py-2">
  <ColorPicker color={draft.color} {taken} onchange={(color) => onchange({ color })} />
  <Field
    variant="inline"
    value={draft.name}
    oninput={(value) => onchange({ name: value })}
    placeholder="Category name"
    autocapitalize="sentences"
    class="min-w-0 flex-1"
  />
  <NumberField
    value={toUnit(draft.hours, "h")}
    unit="h"
    ariaLabel="{name} hours"
    onchange={(hours) => onchange({ hours: fromUnit(hours, "h") })}
  />
  <NumberField
    value={toUnit(draft.hours, "%")}
    unit="%"
    width="w-10"
    ariaLabel="{name} share of the week"
    onchange={(percent) => onchange({ hours: fromUnit(percent, "%") })}
  />
  <IconButton label="Remove {draft.name || 'category'}" tone="plain" onclick={onremove}>
    <X size={15} class="text-fg-faint" />
  </IconButton>
</div>
