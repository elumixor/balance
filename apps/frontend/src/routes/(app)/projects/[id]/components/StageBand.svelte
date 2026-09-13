<script lang="ts">
  import { Field } from "$lib/components";
  import { placeOf, type Scale, type Span } from "$lib/projects/gantt";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { TimelineDrag } from "$lib/projects/timeline.svelte";
  import type { Stage } from "$lib/projects/types";
  import { Trash2 } from "lucide-svelte";

  /**
   * One stage, as a band across the days it covers. Every stage shares this one row, the way a
   * plan is read — "this part of the year is the combat pass" — and the line down each edge is
   * what carries that across the tasks underneath.
   *
   * A stage with no dates of its own spans the tasks that name it, and then there is nothing to
   * drag: moving a band that is only the sum of its tasks would have to move all of them.
   */
  let {
    stage,
    span,
    window: bounds,
    scale,
    drag,
  }: { stage: Stage; span: Span; window: Span; scale: Scale; drag: TimelineDrag } = $props();

  const place = $derived(placeOf(drag.spanOf(stage.id, span) ?? span, bounds, scale));
  const completion = $derived(data.completionOf(stage.projectId, stage.id));
  const movable = $derived(Boolean(stage.startsOn));

  function commit(next: Span) {
    data.updateStage(stage.id, { startsOn: next.start, endsOn: next.end });
  }

  /** A press on the name or on either button is that control's; the rest of the band is the grip. */
  function begin(event: PointerEvent) {
    if (!movable || (event.target as HTMLElement).closest("input, button")) return;
    drag.begin(event, { id: stage.id, span, mode: "move", scale, commit });
  }
</script>

<div
  role="group"
  aria-label="Stage {stage.name || 'without a name'}"
  onpointerdown={begin}
  style="left:{place.left}px;width:{place.width}px"
  class="group/band absolute inset-y-1 flex touch-none items-center gap-1 rounded-sm border border-line-strong
    bg-surface-alt pr-1 pl-0.5 {movable ? 'cursor-grab active:cursor-grabbing' : ''}"
>
  <Field
    value={stage.name}
    variant="bare"
    placeholder="Stage"
    ariaLabel="Stage name"
    oninput={(name) => data.updateStage(stage.id, { name })}
    class="field-sm t-micro text-fg-muted"
  />
  {#if completion.total > 0}
    <span class="t-data-micro shrink-0 text-fg-faint">{Math.round(completion.share * 100)}%</span>
  {/if}
  <button
    type="button"
    onclick={() => data.removeStage(stage)}
    aria-label="Remove stage"
    class="bare-button size-5 opacity-0 group-hover/band:opacity-100 hover:text-danger"
  >
    <Trash2 size={11} />
  </button>

  {#if movable}
    <button
      type="button"
      aria-label="Move the start of {stage.name || 'this stage'}"
      onpointerdown={(event) => drag.begin(event, { id: stage.id, span, mode: "start", scale, commit })}
      class="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-sm hover:bg-fg/15"
    ></button>
    <button
      type="button"
      aria-label="Move the end of {stage.name || 'this stage'}"
      onpointerdown={(event) => drag.begin(event, { id: stage.id, span, mode: "end", scale, commit })}
      class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-sm hover:bg-fg/15"
    ></button>
  {/if}
</div>
