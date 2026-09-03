<script lang="ts">
  import { AnchoredPopup, PopoverItem } from "$lib/components";
  import { pointOnRing, RING_START } from "$lib/components/ring/Arc.svelte";
  import WeekRing, { MIN_ICON_FRACTION, ringRadius } from "$lib/components/ring/WeekRing.svelte";
  import { iconFor } from "$lib/icons";
  import { Scissors, Trash2 } from "lucide-svelte";
  import type { RingSegment } from "$lib/types";
  import CategoryCallout from "./CategoryCallout.svelte";
  import type { Draft } from "$lib/planning/category-drafts.svelte";
  import IconPicker from "./IconPicker.svelte";

  /**
   * The plan, with no list under it: every slice of the ring carries its own label out to the
   * side and keeps a line back to itself. The labels are laid out from the slices — a slice at
   * two o'clock puts its name high on the right — so the page redraws itself as the week is cut,
   * and the ring stays the only place the plan lives.
   *
   * What a category can have done to it hangs off the slice: right-click it, long-press it, or
   * press Enter on it, and the menu opens where the asking happened.
   */
  let {
    segments,
    drafts,
    onhours,
    onsplit,
    onupdate,
    onremove,
    centerValue,
    centerLabel,
  }: {
    /** The drafts' slices, then the buffer — same order as `drafts`, one longer. */
    segments: RingSegment[];
    drafts: Draft[];
    onhours: (values: number[]) => void;
    onsplit: (index: number) => void;
    onupdate: (key: string, patch: Partial<Draft>) => void;
    onremove: (draft: Draft) => void;
    centerValue?: string;
    centerLabel?: string;
  } = $props();

  /** The room between the ring's box and the label column, and how far the line runs flat into it. */
  const GUTTER = 12;
  const LEADER_TAIL = 14;
  /** How far off the band a leader starts, so the line never touches the colour it points at. */
  const KNOT_GAP = 10;
  /** The vertical slot one label claims. Fixed, so a stack of them can be resolved by arithmetic. */
  const CALLOUT_H = 60;
  const TITLE_H = 28;

  let width = $state(0);
  /** The slice whose menu is open, and the point on screen it was opened from. */
  let menu = $state<{ index: number; at: DOMRect } | null>(null);

  const menuDraft = $derived(menu ? drafts[menu.index] : undefined);

  const total = $derived(segments.reduce((sum, s) => sum + s.value, 0) || 1);
  const icons = $derived(drafts.map((d) => d.icon));

  /**
   * Two labels wanting the same height is the normal case — a slice's own middle is only a wish.
   * Each side is spread from the top down, then pulled back inside the box from the bottom up.
   */
  function stack(items: { want: number; y: number }[], height: number) {
    const sorted = [...items].sort((a, b) => a.want - b.want);

    let next = -Infinity;
    for (const item of sorted) {
      item.y = Math.max(item.want, next + CALLOUT_H);
      next = item.y;
    }
    let bottom = height - CALLOUT_H / 2;
    for (let i = sorted.length - 1; i >= 0; i--) {
      sorted[i].y = Math.min(sorted[i].y, bottom);
      bottom = sorted[i].y - CALLOUT_H;
    }
    let top = CALLOUT_H / 2;
    for (const item of sorted) {
      item.y = Math.max(item.y, top);
      top = item.y + CALLOUT_H;
    }
  }

  const layout = $derived.by(() => {
    if (!width) return null;

    const ringSize = Math.round(Math.max(132, Math.min(300, width * 0.36)));
    const thickness = ringSize >= 260 ? 30 : ringSize >= 200 ? 26 : 22;
    const colWidth = Math.round(Math.max(78, Math.min(210, width / 2 - ringSize / 2 - GUTTER)));

    let sum = 0;
    const items = segments.map((segment, index) => {
      const frac = (sum + segment.value / 2) / total;
      sum += segment.value;
      const angle = ((RING_START + frac * 360) * Math.PI) / 180;
      return {
        index,
        segment,
        frac,
        side: (Math.cos(angle) >= 0 ? 1 : -1) as 1 | -1,
        sin: Math.sin(angle),
        want: 0,
        y: 0,
      };
    });

    const labels = items.filter((item) => item.segment.value > 0);
    const rows = (side: 1 | -1) => labels.filter((item) => item.side === side).length;
    const height = Math.max(ringSize + 8, Math.max(rows(1), rows(-1)) * CALLOUT_H + 8);

    const cx = width / 2;
    const cy = height / 2;
    const knot = ringRadius(ringSize, thickness) + thickness / 2 + KNOT_GAP;

    for (const item of labels) item.want = cy + knot * item.sin;
    stack(
      labels.filter((item) => item.side === 1),
      height,
    );
    stack(
      labels.filter((item) => item.side === -1),
      height,
    );

    return {
      ringSize,
      thickness,
      colWidth,
      height,
      cx,
      cy,
      labels: labels.map((item) => {
        const start = pointOnRing(cx, cy, knot, item.frac);
        const rail = cx + item.side * (ringSize / 2 + GUTTER);
        return {
          ...item,
          left: item.side === 1 ? rail : rail - colWidth,
          points: `${start.x},${start.y} ${rail - item.side * LEADER_TAIL},${item.y} ${rail},${item.y}`,
        };
      }),
    };
  });
</script>

<div bind:clientWidth={width} class="relative w-full" style="height:{layout?.height ?? 260}px">
  {#if layout}
    <svg class="pointer-events-none absolute inset-0" width={width} height={layout.height} aria-hidden="true">
      {#each layout.labels as label (label.segment.id)}
        <polyline
          points={label.points}
          fill="none"
          stroke={label.segment.color}
          stroke-width="1"
          stroke-linejoin="round"
        />
      {/each}
    </svg>

    <div
      class="absolute"
      style="left:{layout.cx - layout.ringSize / 2}px;top:{layout.cy - layout.ringSize / 2}px"
    >
      <WeekRing
        {segments}
        onchange={onhours}
        onmenu={(index, at) => (menu = { index, at })}
        size={layout.ringSize}
        thickness={layout.thickness}
        {centerValue}
        {centerLabel}
      >
        {#snippet iconAt(segment, index, size)}
          {#if drafts[index]}
            <IconPicker
              variant="bare"
              {size}
              icon={drafts[index].icon}
              color={drafts[index].color}
              taken={icons}
              onchange={(patch) => onupdate(drafts[index].key, patch)}
            />
          {:else}
            <!-- The buffer wears an icon too, but there is nothing about it to pick. -->
            {@const Icon = iconFor(segment.icon ?? "circle-dashed")}
            <Icon {size} strokeWidth={2.25} />
          {/if}
        {/snippet}
      </WeekRing>
    </div>

    {#each layout.labels as label (label.segment.id)}
      {@const draft = drafts[label.index]}
      <div class="absolute" style="left:{label.left}px;top:{label.y - TITLE_H}px">
        <CategoryCallout
          side={label.side}
          width={layout.colWidth}
          color={label.segment.color}
          name={draft ? draft.name : label.segment.label}
          hours={label.segment.value}
          onchange={draft ? (patch) => onupdate(draft.key, patch) : undefined}
          onmenu={(at) => (menu = { index: label.index, at })}
        >
          {#snippet lead()}
            <!-- A sliver wears no icon on the ring, so its label carries the picker instead. -->
            {#if draft && label.segment.value / total < MIN_ICON_FRACTION}
              <IconPicker
                size={16}
                icon={draft.icon}
                color={draft.color}
                taken={icons}
                onchange={(patch) => onupdate(draft.key, patch)}
              />
            {/if}
          {/snippet}
        </CategoryCallout>
      </div>
    {/each}
  {/if}
</div>

{#if menu}
  {@const index = menu.index}
  <AnchoredPopup rect={menu.at} width={180} onclose={() => (menu = null)}>
    <div role="menu" tabindex="-1">
      <PopoverItem
        label="Split"
        onclick={() => {
          onsplit(index);
          menu = null;
        }}
      >
        {#snippet icon()}
          <Scissors size={15} class="text-fg-muted" />
        {/snippet}
      </PopoverItem>

      {#if menuDraft}
        {@const draft = menuDraft}
        <PopoverItem
          label="Remove"
          tone="danger"
          onclick={() => {
            onremove(draft);
            menu = null;
          }}
        >
          {#snippet icon()}
            <Trash2 size={15} />
          {/snippet}
        </PopoverItem>
      {/if}
    </div>
  </AnchoredPopup>
{/if}
