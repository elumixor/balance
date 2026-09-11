<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Field, NumberField, ProjectCover, Segmented, Select, Skeleton, Textarea } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { ProjectStatus } from "$lib/projects/types";
  import { restColor } from "$lib/ui/colors";
  import { CircleDot, Clock, Plus, Trash2 } from "lucide-svelte";
  import {
    Breadcrumb,
    FieldsPanel,
    MembersRow,
    NotionLinkRow,
    PropertyRow,
    SubProjects,
    TaskBoard,
    TaskInspector,
    TaskList,
    TaskTimeline,
  } from "./components";
  import { ShellSlot } from "../../components";

  /**
   * One project, open: what it is and what it says about itself at the top, and under that the
   * work itself in whichever of the three shapes answers the question being asked — time, order,
   * or where things stand.
   *
   * The view takes the whole of the window below the header, edge to edge and with no card around
   * it: a timeline is a plan somebody reads across, and a measure down the middle of the screen is
   * a month of it nobody can see. Opening a task docks a panel under the view rather than opening
   * a dialog, so the plan it belongs to stays on screen while it is edited.
   */
  void data.enter();

  const id = $derived(page.params.id ?? "");
  const project = $derived(data.projectById(id));
  const card = $derived(project ? data.cardOf(project) : null);
  const color = $derived(card?.category?.color ?? restColor);
  const path = $derived(data.pathOf(id));

  type View = "timeline" | "list" | "board";
  const view = $derived((page.url.searchParams.get("view") as View | null) ?? "timeline");
  const VIEWS = $derived<{ value: View; label: string; href: string }[]>([
    { value: "timeline", label: "Timeline", href: `/projects/${id}` },
    { value: "list", label: "List", href: `/projects/${id}?view=list` },
    { value: "board", label: "Board", href: `/projects/${id}?view=board` },
  ]);

  const STATUSES: { value: ProjectStatus; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "done", label: "Done" },
    { value: "dropped", label: "Dropped" },
  ];

  let selectedId = $state<string | null>(null);
  const selected = $derived(selectedId ? (data.tasksOf(id).find((task) => task.id === selectedId) ?? null) : null);

  // A task selected on one project has nothing to say on the next one.
  $effect(() => {
    void id;
    selectedId = null;
  });

  async function remove() {
    if (!project || !data.remove(project)) return;
    await goto(project.parentId ? `/projects/${project.parentId}` : "/projects");
  }
</script>

{#if !data.ready}
  <div class="safe-top-4 p-5 md:p-10"><Skeleton height={180} radius={10} /></div>
{:else if !project || !card}
  <p class="safe-top-4 p-5 text-fg-muted t-body md:p-10">That project isn’t here any more.</p>
{:else}
  <div class="flex h-full min-h-0 flex-col">
    <!-- On a phone the properties stack under the name, which would leave the plan no room at all;
         there the header keeps half the window and scrolls inside it. -->
    <!-- Where this project sits goes on the shell's own line, beside the nav icons, rather than
         taking a row of the screen to say it twice. A phone has no strip, so there it stays here. -->
    <ShellSlot slot="where">
      <Breadcrumb {path} />
    </ShellSlot>

    <header class="safe-top-4 max-h-[55dvh] shrink-0 overflow-y-auto px-5 pb-4 md:max-h-none md:px-8 md:pt-12">
      <div class="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="md:hidden">
            <Breadcrumb {path} />
          </div>
          <div class="flex min-w-0 items-center gap-3">
            <ProjectCover icon={project.icon} category={card.category} />
            <Field
              value={project.name}
              variant="bare"
              placeholder="Untitled project"
              ariaLabel="Project name"
              oninput={(name) => data.update(project.id, { name })}
              class="t-heading h-auto py-0.5"
            />
          </div>
          <MembersRow {project} />
          <Textarea
            value={project.description}
            variant="bare"
            rows={2}
            placeholder="What is this, in one line?"
            ariaLabel="Description"
            oninput={(description) => data.update(project.id, { description })}
          />
        </div>

        <div class="w-full shrink-0 space-y-4 md:w-72">
          <div class="space-y-0.5">
            <PropertyRow label="Hours a week">
              {#snippet icon()}
                <span class="flex size-6 items-center justify-center"><Clock size={13} /></span>
              {/snippet}
              <NumberField
                value={project.hoursPerWeek}
                unit="h"
                ariaLabel="Hours a week"
                onchange={(hoursPerWeek) => data.update(project.id, { hoursPerWeek })}
              />
            </PropertyRow>
            <PropertyRow label="Status">
              {#snippet icon()}
                <span class="flex size-6 items-center justify-center"><CircleDot size={13} /></span>
              {/snippet}
              <Select
                variant="bare"
                label="Status"
                value={project.status}
                options={STATUSES}
                onchange={(status) => data.setStatus(project, status)}
              />
            </PropertyRow>
            <NotionLinkRow {project} />
            <FieldsPanel {project} />
          </div>

          <SubProjects {project} />

          <div class="flex justify-end">
            <button type="button" onclick={remove} class="bare-button t-micro px-1.5 py-1 hover:text-danger">
              <Trash2 size={12} />
              Delete project
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="flex shrink-0 items-center justify-between gap-3 border-y border-line px-5 md:px-8">
      <Segmented options={VIEWS} value={view} />
      <button type="button" onclick={() => data.addStage(project.id, "")} class="bare-button t-micro px-1.5 py-1">
        <Plus size={11} />
        Stage
      </button>
    </div>

    <div class="min-h-0 flex-1">
      {#if view === "timeline"}
        <TaskTimeline projectId={project.id} {color} {selectedId} onselect={(next) => (selectedId = next)} />
      {:else}
        <div class="h-full overflow-y-auto px-5 py-4 md:px-8">
          <div class="mx-auto max-w-5xl">
            {#if view === "list"}
              <TaskList projectId={project.id} {selectedId} onselect={(next) => (selectedId = next)} />
            {:else}
              <TaskBoard projectId={project.id} {selectedId} onselect={(next) => (selectedId = next)} />
            {/if}
          </div>
        </div>
      {/if}
    </div>

    {#if selected}
      <div class="list-item-in max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-surface">
        <TaskInspector task={selected} onclose={() => (selectedId = null)} />
      </div>
    {/if}
  </div>
{/if}
