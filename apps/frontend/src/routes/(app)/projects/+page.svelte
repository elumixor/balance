<script lang="ts">
  import { NotionMark, NotionSetup, Screen, Skeleton } from "$lib/components";
  import WeekRing from "$lib/components/ring/WeekRing.svelte";
  import { synced } from "$lib/core/synced.svelte";
  import { categoryDrafts as week, WEEK_HOURS } from "$lib/planning/category-drafts.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { iconFor } from "$lib/ui/icons";
  import { CircleDashed, Plus, RefreshCw } from "lucide-svelte";
  import { IconPicker, SphereMenu, SphereSection } from "./components";

  /**
   * The week as it is meant to go, top to bottom: the ring cutting 168 hours into spheres, and
   * beside it each sphere with the projects and practices those hours are for. The ring is the
   * list's picture rather than a second list — a sphere is named, coloured and sized in its own
   * section, and a seam dragged on the ring moves the same hours the sections show.
   *
   * What fills those hours is the calendar's job; this screen only says how much of the week
   * each sphere is owed and which work is owed it.
   */
  void week.enter();
  void data.enter();

  const claimedHours = $derived(WEEK_HOURS - week.restHours);
  const claimedPercent = $derived(Math.round((claimedHours / WEEK_HOURS) * 100));
  const icons = $derived(week.drafts.map((draft) => draft.icon));
  const importing = $derived(data.connections.find((connection) => connection.dataSourceId) ?? null);

  /** The sphere whose menu is open — an index into the ring's segments — and where it was asked. */
  let menu = $state<{ index: number; at: DOMRect } | null>(null);
  let setup = $state(false);

  /** ⌘Z takes back the last edit here — a sphere cut or resized, a project made, a practice renamed. */
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

<Screen title="Projects" wide>
  {#if !week.ready || !data.ready}
    <div class="grid gap-10 lg:grid-cols-[260px_1fr]">
      <Skeleton width={232} height={232} radius={116} />
      <div class="space-y-2">
        {#each [0, 1, 2] as row (row)}
          <Skeleton height={34} radius={6} />
        {/each}
      </div>
    </div>
  {:else}
    <div class="grid gap-10 lg:grid-cols-[260px_1fr]">
      <aside class="flex flex-col items-center gap-3 lg:sticky lg:top-0 lg:self-start">
        <WeekRing
          segments={week.segments}
          onchange={week.setAllHours}
          onmenu={(index, at) => (menu = { index, at })}
          size={240}
          thickness={28}
          centerValue="{Math.round(claimedHours)}h"
          centerLabel="{claimedPercent}% of 168h"
        >
          {#snippet iconAt(segment, index, size)}
            {@const draft = week.drafts[index]}
            {#if draft}
              <IconPicker
                variant="bare"
                {size}
                icon={draft.icon}
                color={draft.color}
                taken={icons}
                onchange={(patch) => week.update(draft.key, patch)}
              />
            {:else}
              {@const Icon = iconFor(segment.icon ?? "circle-dashed")}
              <Icon {size} strokeWidth={2.25} />
            {/if}
          {/snippet}
        </WeekRing>
        <p class="t-micro max-w-[30ch] text-center text-fg-faint">
          Drag a seam to move hours between spheres. Right-click a slice to split it.
        </p>
      </aside>

      <div class="min-w-0 space-y-8">
        {#each week.drafts as draft, index (draft.key)}
          <SphereSection
            {draft}
            taken={icons}
            onupdate={(patch) => week.update(draft.key, patch)}
            onmenu={(at) => (menu = { index, at })}
          />
        {/each}

        <div class="space-y-1">
          <div class="flex h-8 items-center gap-2 text-fg-faint">
            <span class="flex size-7 items-center justify-center"><CircleDashed size={15} /></span>
            <span class="t-label flex-1 px-2">Unplanned</span>
            <span class="t-data px-2">{Math.round(week.restHours * 10) / 10}h</span>
          </div>
          <div class="flex flex-wrap items-center gap-1 pl-7">
            <button type="button" onclick={() => week.split(week.drafts.length)} class="bare-button t-micro h-7 px-2">
              <Plus size={12} />
              Sphere
            </button>
            <button type="button" onclick={() => (setup = true)} class="bare-button t-micro h-7 px-2">
              <NotionMark size={12} />
              Import projects from Notion
            </button>
            {#if importing}
              <button type="button" onclick={() => void data.mirror(true)} class="bare-button t-micro h-7 px-2">
                <RefreshCw size={11} />
                Sync now
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</Screen>

{#if menu}
  {@const index = menu.index}
  {@const draft = week.drafts[index]}
  <SphereMenu
    at={menu.at}
    onsplit={() => week.split(index)}
    onremove={draft ? () => week.remove(draft) : undefined}
    onclose={() => (menu = null)}
  />
{/if}

<NotionSetup open={setup} onclose={() => (setup = false)} />
