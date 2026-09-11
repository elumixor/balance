<script lang="ts">
  import { goto } from "$app/navigation";
  import { Dot, NotionMark, NotionSetup, Screen, Skeleton } from "$lib/components";
  import { synced } from "$lib/core/synced.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { rowsOf } from "$lib/projects/tree";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { ConnectCancelled } from "$lib/core/oauth-connect";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { Plus, RefreshCw } from "lucide-svelte";
  import { EmptyState, PracticeRow, ProjectRow, SphereClaimBar } from "./components";

  /**
   * Everything the hours are for, one column per sphere: the strip saying how that sphere's week
   * is already spoken for, the projects under it in the tree they actually form, and the
   * practices that never complete beneath them. A mirrored workspace is checked when the screen
   * opens, so the tree is what Notion said a moment ago.
   */
  void data.enter();

  let setup = $state(false);
  let connecting = $state(false);

  /**
   * Importing is one press from here whether or not a workspace is connected: the grant is asked
   * for at the moment it is needed, and the dialog it was for opens straight after.
   */
  async function importFromNotion() {
    connecting = true;
    try {
      if (await data.ensureNotion()) setup = true;
    } catch (error) {
      if (!(error instanceof ConnectCancelled)) diagnostics.report("Notion", error, { title: "Couldn't connect Notion" });
    } finally {
      connecting = false;
    }
  }

  async function add(categoryId: string) {
    const created = data.create(null, categoryId);
    if (created) await goto(`/projects/${created.id}`);
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
  <div class="mx-auto max-w-3xl">
    {#if !data.ready}
      <div class="space-y-2">
        {#each [0, 1, 2] as row (row)}
          <Skeleton height={34} radius={6} />
        {/each}
      </div>
    {:else}
      {#if data.spheres.length === 0}
        <EmptyState
          title="Cut the week into spheres first."
          hint="Projects live under the categories on the planning ring."
        />
      {/if}

      <div class="space-y-9">
        {#each data.groups as group (group.category.id)}
          <section class="space-y-2">
            <div class="space-y-1.5">
              <h2 class="t-heading flex items-baseline gap-2.5" style="color:{group.category.color}">
                <Dot color={group.category.color} size={9} />
                {group.category.name || "Unnamed sphere"}
                <span class="t-data-micro font-normal text-fg-faint">
                  {formatHoursDecimal(group.claimed)} of {formatHoursDecimal(group.category.targetHoursPerWeek)}h
                </span>
              </h2>
              <SphereClaimBar
                projects={group.nodes.map((node) => node.item)}
                hours={group.category.targetHoursPerWeek}
                color={group.category.color}
              />
            </div>

            <div>
              {#each rowsOf(group.nodes) as row (row.item.id)}
                <div class="list-item-in"><ProjectRow card={data.cardOf(row.item)} depth={row.depth} /></div>
              {/each}
              <button type="button" onclick={() => add(group.category.id)} class="bare-button t-micro px-2 py-1.5">
                <Plus size={12} />
                New project
              </button>
            </div>

            {#if group.practices.length > 0}
              <div class="divide-y divide-line rounded-lg border border-line bg-surface px-3">
                {#each group.practices as practice (practice.id)}
                  <PracticeRow
                    {practice}
                    progress={data.progress?.practices[practice.id] ?? null}
                    color={group.category.color}
                  />
                {/each}
              </div>
            {/if}
            <button
              type="button"
              onclick={() => data.createPractice(group.category.id)}
              class="bare-button t-micro px-2 py-1"
            >
              <Plus size={12} />
              Practice — recurring, never completes
            </button>
          </section>
        {/each}
      </div>

      <div class="mt-8 flex items-center gap-1">
        <button type="button" onclick={() => void importFromNotion()} class="bare-button t-micro px-2 py-1">
          <NotionMark size={12} />
          {connecting ? "Waiting for Notion…" : data.notion?.dataSourceId ? "Notion import" : "Import from Notion"}
        </button>
        {#if data.notion?.dataSourceId}
          <button type="button" onclick={() => void data.mirror(true)} class="bare-button t-micro px-2 py-1">
            <RefreshCw size={11} />
            Sync now
          </button>
        {/if}
      </div>
    {/if}
  </div>
</Screen>

<NotionSetup open={setup} onclose={() => (setup = false)} />
