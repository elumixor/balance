<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Field, NumberField, ProjectCover, Screen, Segmented, Select, Skeleton, Textarea } from "$lib/components";
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

  /**
   * One project, open: what it is, what it says about itself, what sits under it, and the work
   * itself in whichever of the three shapes answers the question being asked — time, order, or
   * where things stand. Opening a task is a panel under the view rather than a dialog, so the
   * plan it belongs to stays on screen while it is edited.
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

<Screen title={project?.name || "Project"} wide>
  {#if !data.ready}
    <Skeleton height={180} radius={10} />
  {:else if !project || !card}
    <p class="t-body text-fg-muted">That project isn’t here any more.</p>
  {:else}
    <div class="mx-auto max-w-5xl space-y-8">
      <header class="space-y-4">
        <Breadcrumb {path} />

        <div class="flex flex-col gap-8 md:flex-row md:items-start">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <ProjectCover icon={project.icon} category={card.category} />
            <div class="min-w-0 flex-1">
              <Field
                value={project.name}
                variant="bare"
                placeholder="Untitled project"
                ariaLabel="Project name"
                oninput={(name) => data.update(project.id, { name })}
                class="t-heading h-auto py-0.5"
              />
              <Textarea
                value={project.description}
                variant="bare"
                rows={2}
                placeholder="What is this, in one line?"
                ariaLabel="Description"
                oninput={(description) => data.update(project.id, { description })}
              />
              <div class="mt-1 flex items-center gap-3 px-2">
                <MembersRow {project} />
              </div>
            </div>
          </div>

          <div class="w-full shrink-0 space-y-0.5 md:w-72">
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
        </div>
      </header>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <Segmented options={VIEWS} value={view} />
          <button
            type="button"
            onclick={() => data.addStage(project.id, "")}
            class="bare-button t-micro px-1.5 py-1"
          >
            <Plus size={11} />
            Stage
          </button>
        </div>

        {#if view === "timeline"}
          <TaskTimeline projectId={project.id} {color} {selectedId} onselect={(next) => (selectedId = next)} />
        {:else if view === "list"}
          <TaskList projectId={project.id} {selectedId} onselect={(next) => (selectedId = next)} />
        {:else}
          <TaskBoard projectId={project.id} {selectedId} onselect={(next) => (selectedId = next)} />
        {/if}

        {#if selected}
          <div class="list-item-in"><TaskInspector task={selected} onclose={() => (selectedId = null)} /></div>
        {/if}
      </section>

      <SubProjects {project} />

      <div class="flex justify-end">
        <button type="button" onclick={remove} class="bare-button t-micro px-1.5 py-1 hover:text-danger">
          <Trash2 size={12} />
          Delete project
        </button>
      </div>
    </div>
  {/if}
</Screen>
