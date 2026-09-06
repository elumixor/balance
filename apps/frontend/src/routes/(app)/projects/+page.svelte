<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Dot, EmptyState, Screen, Segmented, Skeleton } from "$lib/components";
  import { PracticeRow, ProjectCard, RankingPrompt } from "./components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { synced } from "$lib/core/synced.svelte";
  import { Plus, Sparkles } from "lucide-svelte";

  /**
   * The projects those hours are for: a gallery of cards under the spheres they belong to, in the
   * sphere's own colour — a sibling of the planning dial rather than a board. Three ways to look at
   * the same cards, in the address so a reload keeps the one you had.
   */
  void data.enter();

  type View = "gallery" | "decisions" | "archive";
  const view = $derived((page.url.searchParams.get("view") as View | null) ?? "gallery");
  const VIEWS: { value: View; label: string; href: string }[] = [
    { value: "gallery", label: "By sphere", href: "/projects" },
    { value: "decisions", label: "By decision", href: "/projects?view=decisions" },
    { value: "archive", label: "Archive", href: "/projects?view=archive" },
  ];

  function add(categoryId?: string) {
    const created = data.create(categoryId);
    if (created) void goto(`/projects/${created.id}`);
  }

  /** ⌘Z takes back the last edit here — a project made, a practice renamed, a stage cut. */
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
  <div class="mb-6"><Segmented options={VIEWS} value={view} /></div>

  {#if !data.ready}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {#each [0, 1, 2] as i (i)}
        <Skeleton height={124} radius={10} />
      {/each}
    </div>
  {:else if view === "gallery"}
    {#if data.spheres.length === 0}
      <EmptyState title="Cut the week into spheres first." hint="Projects live under the categories on the planning ring." />
    {/if}
    <div class="space-y-10">
      {#each data.groups as group (group.category.id)}
        {@const color = group.category.color}
        <section class="space-y-3">
          <h2 class="t-heading flex items-center gap-2.5" style="color:{color}">
            <Dot {color} size={10} />
            {group.category.name || "Unnamed sphere"}
          </h2>

          {#if group.over > 0 && group.cards.length > 1}
            <RankingPrompt category={group.category} over={group.over} />
          {/if}

          {#each group.wishes as wish (wish.id)}
            <p class="t-micro flex items-center gap-1.5 text-fg-faint">
              <Sparkles size={11} />
              “{wish.statement}” has nothing under it yet.
            </p>
          {/each}

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each group.cards as card (card.project.id)}
              <div class="list-item-in"><ProjectCard {card} today={data.today} /></div>
            {/each}
            <button
              type="button"
              onclick={() => add(group.category.id)}
              class="press hoverable flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-fg-muted"
            >
              <Plus size={15} />
              <span class="t-label">New project</span>
            </button>
          </div>

          {#if group.practices.length > 0}
            <div class="divide-y divide-line rounded-lg border border-line bg-surface px-3">
              {#each group.practices as practice (practice.id)}
                <PracticeRow {practice} progress={data.progress?.practices[practice.id] ?? null} {color} />
              {/each}
            </div>
          {/if}
          <button
            type="button"
            onclick={() => data.createPractice(group.category.id)}
            class="press hoverable -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-fg-faint"
          >
            <Plus size={13} />
            <span class="t-micro">Practice — recurring, never completes</span>
          </button>
        </section>
      {/each}
    </div>
  {:else if view === "decisions"}
    {#if data.byDecision.length === 0}
      <EmptyState title="Nothing is waiting on a decision." />
    {/if}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {#each data.byDecision as card (card.project.id)}
        <div class="list-item-in"><ProjectCard {card} today={data.today} /></div>
      {/each}
    </div>
  {:else}
    {#if data.archive.length === 0}
      <EmptyState title="Nothing parked, shipped or killed yet." hint="A finished project keeps its card here." />
    {/if}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {#each data.archive as card (card.project.id)}
        <div class="list-item-in"><ProjectCard {card} today={data.today} /></div>
      {/each}
    </div>
  {/if}

</Screen>
