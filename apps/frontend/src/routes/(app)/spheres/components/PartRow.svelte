<script lang="ts">
  import { Field, NumberField } from "$lib/components";
  import { type Draft, fromUnit, toUnit } from "$lib/planning/category-drafts.svelte";
  import type { SphereProgress } from "$lib/planning/types";
  import { Ellipsis } from "lucide-svelte";
  import KeepLink from "./KeepLink.svelte";
  import WeekBar from "./WeekBar.svelte";

  /**
   * A part of a sphere: a name, the share of its parent's hours it is owed, and its week against
   * them. Its hours come out of the parent's rather than the week's, so it is no slice of the ring.
   */
  let {
    draft,
    progress,
    onupdate,
    onmenu,
  }: {
    draft: Draft;
    progress: SphereProgress | null;
    onupdate: (patch: Partial<Draft>) => void;
    onmenu: (at: DOMRect) => void;
  } = $props();

  const label = $derived(draft.name || "New part");

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    const at = event.type === "contextmenu"
      ? new DOMRect(event.clientX, event.clientY, 0, 0)
      : (event.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu(at);
  }
</script>

<div class="space-y-1 py-2" role="presentation" oncontextmenu={openMenu}>
  <div class="flex items-center gap-2">
    <span class="size-2 shrink-0 rounded-full" style:background={draft.color}></span>
    <Field
      variant="bare-sm"
      value={draft.name}
      placeholder="New part"
      autocapitalize="sentences"
      ariaLabel="Part name"
      oninput={(name) => onupdate({ name })}
      class="min-w-0 flex-1"
    />
    {#if draft.urn}<KeepLink urn={draft.urn} />{/if}
    <NumberField
      value={toUnit(draft.hours, "h")}
      unit="h"
      size="sm"
      ariaLabel="{label} hours a week"
      onchange={(value) => onupdate({ hours: fromUnit(value, "h") })}
    />
    <button type="button" onclick={openMenu} aria-label="{label} options" class="bare-button size-7">
      <Ellipsis size={14} />
    </button>
  </div>
  {#if progress}
    <div class="pl-4"><WeekBar {progress} color={draft.color} /></div>
  {/if}
</div>
