<script lang="ts">
  import CategoryPicker from "$lib/calendar/CategoryPicker.svelte";
  import AnchoredPopup from "$lib/components/AnchoredPopup.svelte";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import { restColor, withAlpha } from "$lib/colors";
  import type { Category } from "$lib/types";
  import { Scissors, X } from "lucide-svelte";
  import type { Piece } from "./activities-data.svelte";

  /**
   * An activity's hour, cut into pieces: one per category it feeds, plus whatever's left unclaimed.
   * The unclaimed remainder is never stored — it's just 100 minus what the pieces already say,
   * which is what keeps them always summing to a whole hour without a validation step anywhere.
   *
   * A piece's own edge is a drag handle; the seam before the unclaimed remainder is one too, so
   * claiming more of it is the same gesture as trading share with a neighbour. Right-click a piece
   * to split it in two or collapse it away; click its icon or name to point it at a different
   * category.
   */
  let {
    pieces,
    categories,
    categoryById,
    onchange,
  }: {
    pieces: readonly Piece[];
    categories: readonly Category[];
    categoryById: Map<string, Category>;
    onchange: (pieces: Piece[]) => void;
  } = $props();

  let cut = 0;
  const claimed = $derived(pieces.reduce((sum, p) => sum + p.percent, 0));
  const free = $derived(Math.max(0, 100 - claimed));

  let barWidth = $state(0);
  let menu = $state<{ key: string | null; at: DOMRect } | null>(null);
  let picking = $state<{ key: string; at: DOMRect } | null>(null);

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

  function pick(key: string, categoryId: string) {
    onchange(pieces.map((p) => (p.key === key ? { ...p, categoryId } : p)));
    picking = null;
  }

  /** `null` splits the unclaimed remainder into a new piece; otherwise a piece is cut in two. */
  function split(key: string | null) {
    if (key === null) {
      const category = categories.find((c) => !pieces.some((p) => p.categoryId === c.id)) ?? categories[0];
      if (!category || free <= 0) return;
      onchange([...pieces, { key: `split-${++cut}`, categoryId: category.id, percent: Math.max(1, Math.round(free / 2)) }]);
    } else {
      const index = pieces.findIndex((p) => p.key === key);
      const piece = pieces[index];
      if (!piece) return;
      const half = Math.floor(piece.percent / 2);
      const next = [...pieces];
      next.splice(
        index,
        1,
        { ...piece, percent: half },
        { key: `split-${++cut}`, categoryId: piece.categoryId, percent: piece.percent - half },
      );
      onchange(next);
    }
    menu = null;
  }

  function collapse(key: string) {
    onchange(pieces.filter((p) => p.key !== key));
    menu = null;
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:clientWidth={barWidth} class="flex items-stretch overflow-hidden rounded-md border border-line h-11">
  {#each pieces as piece, i (piece.key)}
    {@const color = colorOf(piece.categoryId)}
    {@const category = categoryById.get(piece.categoryId)}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div
      role="button"
      tabindex="0"
      aria-label="Change category for {category?.name ?? 'this piece'}"
      class="press-sm relative flex min-w-0 cursor-pointer items-center gap-1.5 px-2"
      style="flex:{piece.percent} 0 0%;background:{withAlpha(color, 0.14)}"
      onclick={(e) => {
        // The percent field is for typing, not picking — a click that lands there is its own thing.
        if ((e.target as Element).closest("input")) return;
        picking = { key: piece.key, at: e.currentTarget.getBoundingClientRect() };
      }}
      oncontextmenu={(e) => {
        e.preventDefault();
        menu = { key: piece.key, at: new DOMRect(e.clientX, e.clientY, 0, 0) };
      }}
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex min-w-0 items-center justify-center px-2 text-fg-faint"
      style="flex:{free} 0 0%;background:{withAlpha(restColor, 0.08)}"
      oncontextmenu={(e) => {
        e.preventDefault();
        menu = { key: null, at: new DOMRect(e.clientX, e.clientY, 0, 0) };
      }}
    >
      {#if free >= 12}<span class="t-micro">Unclaimed {free}%</span>{/if}
    </div>
  {/if}
</div>

{#if menu}
  {@const m = menu}
  <AnchoredPopup rect={m.at} width={160} onclose={() => (menu = null)}>
    <div role="menu" tabindex="-1">
      {#if m.key !== null || free > 0}
        <PopoverItem label="Split" onclick={() => split(m.key)}>
          {#snippet icon()}
            <Scissors size={15} class="text-fg-muted" />
          {/snippet}
        </PopoverItem>
      {/if}
      {#if m.key !== null}
        {@const key = m.key}
        <PopoverItem label="Collapse" tone="danger" onclick={() => collapse(key)}>
          {#snippet icon()}
            <X size={15} />
          {/snippet}
        </PopoverItem>
      {/if}
    </div>
  </AnchoredPopup>
{/if}

{#if picking}
  {@const p = picking}
  <CategoryPicker
    rect={p.at}
    {categories}
    value={pieces.find((piece) => piece.key === p.key)?.categoryId ?? ""}
    onchoose={(categoryId) => pick(p.key, categoryId)}
    onclose={() => (picking = null)}
  />
{/if}
