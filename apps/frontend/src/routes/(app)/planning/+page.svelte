<script lang="ts">
  import { Screen, Skeleton } from "$lib/components";
  import { synced } from "$lib/synced.svelte";
  import { categoryDrafts as week, WEEK_HOURS } from "$lib/planning/category-drafts.svelte";
  import { PlanDial } from "./components";

  /**
   * The week you mean to have: the ring cuts 168 hours into the categories worth spending them on.
   *
   * The categories have no list of their own: each one labels its own slice from the side, which
   * is the only place the shape and the numbers can't drift apart. What fills those hours is the
   * calendar's job — this screen only says how much of the week each category is owed.
   */

  void week.enter();

  const claimedHours = $derived(WEEK_HOURS - week.restHours);
  const claimedPercent = $derived(Math.round((claimedHours / WEEK_HOURS) * 100));

  /** ⌘Z takes back the last edit here — a category cut, renamed or recoloured, or removed. */
  function onkeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const redo = key === "y" || (key === "z" && e.shiftKey);
    if (key !== "z" && !redo) return;

    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

    e.preventDefault();
    if (redo) synced.redo();
    else synced.undo();
  }
</script>

<svelte:window {onkeydown} />

<Screen title="Planning" wide>
  {#if !week.ready}
    <div class="flex flex-col items-center gap-4">
      <Skeleton width={232} height={232} radius={116} />
      <Skeleton width="80%" height={16} />
    </div>
  {:else}
    <div class="mx-auto max-w-3xl">
      <PlanDial
        segments={week.segments}
        drafts={week.drafts}
        onhours={week.setAllHours}
        onsplit={week.split}
        onupdate={(key, patch) => week.update(key, patch)}
        onremove={(draft) => week.remove(draft)}
        centerValue="{Math.round(claimedHours)}h"
        centerLabel="{claimedPercent}% of 168h claimed"
      />


      <p class="t-micro mx-auto mt-4 max-w-[40ch] text-center text-fg-faint">
        Tap a slice's icon to change how it looks, drag a seam to move hours between neighbours, or
        right-click a slice to cut a new category out of it.
      </p>
    </div>

  {/if}
</Screen>
