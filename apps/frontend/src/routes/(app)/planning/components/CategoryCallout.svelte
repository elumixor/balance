<script lang="ts">
  import { Field, NumberField } from "$lib/components";
  import type { Snippet } from "svelte";
  import { fromUnit, toUnit } from "$lib/planning/category-drafts.svelte";

  /**
   * A category's label, out beside the ring and pointing at its own slice. The rule under the
   * name is where the leader line lands, so the name reads as attached to the colour rather than
   * listed near it: name on top of the line, the hours it stands for underneath.
   *
   * Nothing here does anything to the category itself — cutting it in two or dropping it belongs
   * to the slice, which is the thing being cut.
   */
  let {
    side,
    width,
    color,
    name,
    hours,
    onchange,
    onmenu,
    lead,
  }: {
    /** 1 when the slice sits on the right of the ring, -1 on the left. */
    side: 1 | -1;
    width: number;
    color: string;
    name: string;
    hours: number;
    /** Absent for the buffer, which is only ever what the categories above it leave. */
    onchange?: (patch: { name?: string; hours?: number }) => void;
    /** The label answers a right-click with its slice's menu — it stands for the slice. */
    onmenu: (at: DOMRect) => void;
    /** A slice too thin to wear its icon hands it to the label instead, at the ring's side. */
    lead?: Snippet;
  } = $props();

  const label = $derived(name || "New category");
  const outward = $derived(side === 1 ? "flex-row" : "flex-row-reverse");
</script>

<div
  style="width:{width}px"
  role="presentation"
  oncontextmenu={(event) => {
    event.preventDefault();
    onmenu(new DOMRect(event.clientX, event.clientY, 0, 0));
  }}
>
  <div class="flex h-7 items-center gap-0.5 {outward}">
    {#if lead}
      <span class="shrink-0">{@render lead()}</span>
    {/if}

    {#if onchange}
      <Field
        variant="bare-sm"
        value={name}
        oninput={(value) => onchange?.({ name: value })}
        placeholder="Category name"
        autocapitalize="sentences"
        align={side === 1 ? "left" : "right"}
        class="min-w-0 flex-1"
      />
    {:else}
      <span class="t-label min-w-0 flex-1 truncate px-1 text-fg-muted {side === 1 ? '' : 'text-right'}">
        {name}
      </span>
    {/if}
  </div>

  <!-- The leader line arrives here and keeps going: same weight, same colour, no seam. -->
  <div class="h-px" style="background:{color}"></div>

  <div class="flex h-7 flex-wrap items-center gap-1 pt-0.5 {outward}">
    {#if onchange}
      <NumberField
        size="sm"
        width="w-7"
        value={toUnit(hours, "h")}
        unit="h"
        ariaLabel="{label} hours"
        onchange={(value) => onchange?.({ hours: fromUnit(value, "h") })}
      />
      <NumberField
        size="sm"
        width="w-6"
        value={toUnit(hours, "%")}
        unit="%"
        ariaLabel="{label} share of the week"
        onchange={(value) => onchange?.({ hours: fromUnit(value, "%") })}
      />
    {:else}
      <span class="t-data-micro px-1 text-fg-muted">{toUnit(hours, "h")}h</span>
      <span class="t-data-micro text-fg-faint">{toUnit(hours, "%")}%</span>
    {/if}
  </div>
</div>
