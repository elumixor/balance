<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Field, NumberField, ProjectCover, Screen, Segmented, Skeleton, StatusChip, Textarea } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { ProjectStatus } from "$lib/projects/types";
  import { restColor } from "$lib/ui/colors";
  import { ExternalLink, Trash2 } from "lucide-svelte";
  import { Breadcrumb, FieldsPanel, MembersRow, SubProjects, TaskBoard, TaskList, TaskTimeline } from "./components";

  /**
   * One project, open: what it is, what it says about itself, what sits under it, and the work
   * itself in whichever of the three shapes answers the question being asked — time, order, or
   * where things stand.
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

  const STATUSES: ProjectStatus[] = ["active", "paused", "done", "dropped"];

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
    <div class="space-y-8">
      <header class="space-y-3">
        <Breadcrumb {path} />

        <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <ProjectCover icon={project.icon} category={card.category} />
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex items-center gap-2">
                <Field
                  value={project.name}
                  variant="bare"
                  placeholder="Untitled project"
                  ariaLabel="Project name"
                  oninput={(name) => data.update(project.id, { name })}
                  class="t-title"
                />
                <StatusChip status={project.status} />
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
          </div>

          <div class="w-full space-y-3 md:w-72">
            <FieldsPanel {project} />

            <div class="flex items-center gap-2">
              <span class="t-micro flex-1 text-fg-muted">Hours a week</span>
              <NumberField
                value={project.hoursPerWeek}
                unit="h"
                ariaLabel="Hours a week"
                onchange={(hoursPerWeek) => data.update(project.id, { hoursPerWeek })}
              />
            </div>

            <div class="flex items-center gap-2">
              <span class="t-micro flex-1 text-fg-muted">Status</span>
              <select
                class="field-boxed"
                value={project.status}
                onchange={(e) => data.setStatus(project, e.currentTarget.value as ProjectStatus)}
              >
                {#each STATUSES as status (status)}
                  <option value={status}>{status}</option>
                {/each}
              </select>
            </div>

            <div class="flex items-center justify-between">
              {#if project.notionUrl}
                <a
                  href={project.notionUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="t-micro flex items-center gap-1.5 text-fg-muted underline-offset-2 hover:underline"
                >
                  <ExternalLink size={12} />
                  Open in Notion
                </a>
              {:else}
                <span></span>
              {/if}
              <button type="button" onclick={remove} class="press t-micro flex items-center gap-1.5 text-danger">
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        </div>
      </header>

      {#if card.childCount > 0}
        <SubProjects {project} />
      {/if}

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="t-label text-fg-muted">Tasks</h2>
          <Segmented options={VIEWS} value={view} />
        </div>

        {#if view === "timeline"}
          <TaskTimeline projectId={project.id} {color} />
        {:else if view === "list"}
          <TaskList projectId={project.id} />
        {:else}
          <TaskBoard projectId={project.id} />
        {/if}

        <button
          type="button"
          onclick={() => data.addStage(project.id, "")}
          class="press hoverable t-micro rounded-md text-fg-faint"
        >
          + Stage
        </button>
      </section>

      {#if card.childCount === 0}
        <SubProjects {project} />
      {/if}
    </div>
  {/if}
</Screen>
