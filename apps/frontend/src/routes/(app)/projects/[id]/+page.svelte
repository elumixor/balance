<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Field, ProjectCover, Skeleton, Textarea } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { restColor } from "$lib/ui/colors";
  import { Trash2 } from "lucide-svelte";
  import { Breadcrumb, ProjectProperties, SubProjects, TaskInspector, TaskTimeline } from "./components";
  import { ShellSlot } from "../../components";

  /**
   * One project, open: its name, a line about it, a row of what it is — sphere, hours, status,
   * people, where its tasks come from — and what sits under it; then the plan itself.
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

  let selectedId = $state<string | null>(null);
  const selected = $derived(selectedId ? (data.tasksOf(id).find((task) => task.id === selectedId) ?? null) : null);

  // A task selected on one project has nothing to say on the next one — unless the way in named
  // one (`?task=`, from the palette), in which case that is the task to open on.
  $effect(() => {
    void id;
    selectedId = page.url.searchParams.get("task");
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
    <!-- On a phone the chips wrap under the name, which could leave the plan no room at all;
         there the header keeps half the window and scrolls inside it. -->
    <!-- Where this project sits goes on the shell's own line, beside the nav icons, rather than
         taking a row of the screen to say it twice. A phone has no strip, so there it stays here. -->
    <ShellSlot slot="where">
      <Breadcrumb {path} />
    </ShellSlot>

    <header class="safe-top-4 max-h-[55dvh] shrink-0 overflow-y-auto px-5 pb-5 md:max-h-none md:px-8 md:pt-12">
      <div class="mx-auto max-w-5xl space-y-3">
        <div class="md:hidden">
          <Breadcrumb {path} />
        </div>
        <!-- The cover hangs to the left of everything about the project, so the name, the line
             under it and the chips all start on one edge: the text inside the bare fields. -->
        <div class="flex items-start gap-3">
          <ProjectCover icon={project.icon} category={card.category} />
          <div class="min-w-0 flex-1 space-y-2.5">
            <div class="flex items-center gap-2">
              <Field
                value={project.name}
                variant="bare"
                placeholder="Untitled project"
                ariaLabel="Project name"
                oninput={(name) => data.update(project.id, { name })}
                class="t-heading h-11 flex-1"
              />
              <button
                type="button"
                onclick={remove}
                aria-label="Delete project"
                class="bare-button size-8 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <Textarea
              value={project.description}
              variant="bare"
              rows={1}
              placeholder="What is this, in one line?"
              ariaLabel="Description"
              oninput={(description) => data.update(project.id, { description })}
            />
            <div class="space-y-1.5 px-2">
              <ProjectProperties {project} />
              <SubProjects {project} />
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="min-h-0 flex-1">
      <TaskTimeline projectId={project.id} {color} {selectedId} onselect={(next) => (selectedId = next)} />
    </div>

    {#if selected}
      <div class="list-item-in max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-surface">
        <TaskInspector task={selected} onclose={() => (selectedId = null)} />
      </div>
    {/if}
  </div>
{/if}
