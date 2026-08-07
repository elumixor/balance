<script lang="ts">
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import { X } from "lucide-svelte";
  import type { Draft } from "./category-drafts.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  /** One editable row in the Week screen's category plan: colour swatch, name, hours, remove. */
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
    value={draft.hours}
    unit="h"
    ariaLabel="{draft.name || 'New category'} hours"
    onchange={(hours) => onchange({ hours })}
  />
  <IconButton label="Remove {draft.name || 'category'}" tone="plain" onclick={onremove}>
    <X size={15} class="text-fg-faint" />
  </IconButton>
</div>
