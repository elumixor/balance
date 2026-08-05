<script lang="ts">
  import Divider from "$lib/components/Divider.svelte";
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import { X } from "lucide-svelte";
  import type { Draft } from "./category-drafts.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  /** One editable row in the Week screen's category plan: colour swatch, name, hours, remove. */
  let {
    draft,
    index,
    taken,
    onchange,
    onremove,
  }: {
    draft: Draft;
    index: number;
    taken: string[];
    onchange: (patch: Partial<Draft>) => void;
    onremove: () => void;
  } = $props();
</script>

<div class="list-item-in" style="animation-delay:{Math.min(index, 8) * 35}ms">
  {#if index > 0}<Divider />{/if}
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
    <span class="flex items-center">
      <Field
        variant="inline"
        mono
        align="right"
        inputmode="decimal"
        ariaLabel="{draft.name || 'New category'} hours"
        value={String(draft.hours)}
        oninput={(value) => {
          const hours = Number(value);
          if (!Number.isNaN(hours)) onchange({ hours });
        }}
        class="w-11"
      />
      <span class="t-data text-fg-faint">h</span>
    </span>
    <IconButton label="Remove {draft.name || 'category'}" tone="plain" onclick={onremove}>
      <X size={15} class="text-fg-faint" />
    </IconButton>
  </div>
</div>
