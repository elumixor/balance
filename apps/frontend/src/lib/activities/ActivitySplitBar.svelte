<script lang="ts">
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import { restColor, withAlpha } from "$lib/colors";
  import type { Category } from "$lib/types";
  import type { Piece } from "./activities-data.svelte";

  /**
   * An activity's hour, cut into pieces: one per category it feeds, plus whatever's left unclaimed.
   * The unclaimed remainder is never stored — it's just 100 minus what the pieces already say,
   * which is what keeps them always summing to a whole hour without a validation step anywhere.
   *
   * A piece's own edge is a drag handle; the seam before the unclaimed remainder is one too, so
   * claiming more of it is the same gesture as trading share with a neighbour.
   */
  let {
    pieces,
    categoryById,
    onchange,
  }: {
    pieces: readonly Piece[];
    categories: readonly Category[];
    categoryById: Map<string, Category>;
    onchange: (pieces: Piece[]) => void;
  } = $props();

  const claimed = $derived(pieces.reduce((sum, p) => sum + p.percent, 0));
  const free = $derived(Math.max(0, 100 - claimed));

  let barWidth = $state(0);

  function colorOf(categoryId: string) {
    const category = categoryById.get(categoryId);
    return category?.isBuffer ? restColor : (category?.color ?? restColor);
  }

  function setPercent(key: string, value: number) {
    const piece = pieces.find((p) => p.key === key);
    if (!piece) return;
    const clamped = Math.max(0, Math.min(piece.percent + free, Math.round(value)));
    onchange(pieces.map((p) => (p.key === key ? { ...p, percent: clamped } : p)));
  }

  // --- dragging a seam between two adjacent shares ---------------------------------------

  let dragging: { leftKey: string; rightKey: string | null; leftStart: number; rightStart: number; originX: number } | null =
    null;

  function beginDrag(leftKey: string, rightKey: string | null, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const left = pieces.find((p) => p.key === leftKey);
    if (!left) return;
    const right = rightKey ? pieces.find((p) => p.key === rightKey) : null;
    dragging = { leftKey, rightKey, leftStart: left.percent, rightStart: right ? right.percent : free, originX: e.clientX };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function moveDrag(e: PointerEvent) {
    const drag = dragging;
    if (!drag || !barWidth) return;
    const deltaPercent = ((e.clientX - drag.originX) / barWidth) * 100;
    const span = drag.leftStart + drag.rightStart;
    const leftNext = Math.max(0, Math.min(span, Math.round(drag.leftStart + deltaPercent)));
    const rightNext = span - leftNext;
    onchange(
      pieces.map((p) => {
        if (p.key === drag.leftKey) return { ...p, percent: leftNext };
        if (drag.rightKey && p.key === drag.rightKey) return { ...p, percent: rightNext };
        return p;
      }),
    );
  }

  function endDrag() {
    dragging = null;
  }
</script>

<div bind:clientWidth={barWidth} class="flex items-stretch overflow-hidden rounded-md border border-line h-11">
  {#each pieces as piece, i (piece.key)}
    {@const color = colorOf(piece.categoryId)}
    {@const category = categoryById.get(piece.categoryId)}
    <div
      class="relative flex min-w-0 items-center gap-1.5 px-2"
      style="flex:{piece.percent} 0 0%;background:{withAlpha(color, 0.14)}"
    >
      <span class="shrink-0">
        <CategoryIcon icon={category?.icon ?? "circle"} {color} size={26} />
      </span>
      {#if piece.percent >= 18}
        <span class="t-label min-w-0 flex-1 truncate text-fg">
          {category ? (category.isBuffer ? "Free time" : category.name) : "Pick one"}
        </span>
      {/if}
      {#if piece.percent >= 9}
        <NumberField
          value={piece.percent}
          unit="%"
          size="sm"
          width="w-7"
          inputmode="numeric"
          ariaLabel="{category?.name ?? 'Share'} percent"
          onchange={(value) => setPercent(piece.key, value)}
        />
      {/if}
    </div>

    {#if i < pieces.length - 1 || free > 0}
      <div class="relative w-0 shrink-0">
        <div class="absolute inset-y-1.5 left-0 w-px bg-line-strong"></div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 z-10 -mx-1.5 w-3 cursor-col-resize touch-none"
          onpointerdown={(e) => beginDrag(piece.key, pieces[i + 1]?.key ?? null, e)}
          onpointermove={moveDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
        ></div>
      </div>
    {/if}
  {/each}

  {#if free > 0}
    <div
      class="flex min-w-0 items-center justify-center px-2 text-fg-faint"
      style="flex:{free} 0 0%;background:{withAlpha(restColor, 0.08)}"
    >
      {#if free >= 12}<span class="t-micro">Unclaimed {free}%</span>{/if}
    </div>
  {/if}
</div>
