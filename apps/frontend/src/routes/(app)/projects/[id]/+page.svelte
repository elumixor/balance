<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import CategoryPicker from "$lib/calendar/CategoryPicker.svelte";
  import Button from "$lib/components/Button.svelte";
  import Dot from "$lib/components/Dot.svelte";
  import Field from "$lib/components/Field.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import Select from "$lib/components/Select.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import { restColor } from "$lib/colors";
  import { formatHoursDecimal } from "$lib/format";
  import CheckpointCard from "$lib/projects/CheckpointCard.svelte";
  import CreateAssist from "$lib/projects/CreateAssist.svelte";
  import DecisionSheet from "$lib/projects/DecisionSheet.svelte";
  import GoalPicker from "$lib/projects/GoalPicker.svelte";
  import HoursBars from "$lib/projects/HoursBars.svelte";
  import LinksList from "$lib/projects/LinksList.svelte";
  import PeopleList from "$lib/projects/PeopleList.svelte";
  import ProjectCover from "$lib/projects/ProjectCover.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import StageRail from "$lib/projects/StageRail.svelte";
  import StatusChip from "$lib/projects/StatusChip.svelte";
  import TaskList from "$lib/projects/TaskList.svelte";
  import { TEMPLATES } from "$lib/projects/templates";
  import { synced } from "$lib/synced.svelte";
  import type { ProjectTemplate } from "$lib/types";
  import { ArrowLeft, MoreHorizontal } from "lucide-svelte";

  /**
   * One project, open. Nothing here has a Save button: every field is a synced record written a
   * moment after the typing stops. The stage rail is the spine, the decision is inside the running
   * stage, and the evidence — hours, gate count — is the calendar's, refetched behind the page.
   */
  void data.enter();

  const id = $derived(page.params.id ?? "");
  const card = $derived(data.cardById.get(id) ?? null);
  const project = $derived(card?.project ?? null);
  const stages = $derived(data.stagesOf(id));
  const color = $derived(card?.category?.color ?? restColor);
  const currentTasks = $derived(card?.stage ? (data.tasksByStage.get(card.stage.id) ?? []) : []);
  const hoursInvested = $derived(card?.hoursByWeek.reduce((sum, h) => sum + h, 0) ?? 0);
  const isLast = $derived(card?.stage ? !stages.some((s) => s.ordinal > (card.stage?.ordinal ?? 0) && !s.outcome) : true);

  let deciding = $state(false);
  let sphereRect = $state<DOMRect | null>(null);
  let coverDraft = $state<string | null>(null);

  /** The name field grabs focus on a project that was just made — the ten-second promise. */
  let nameEl = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (!nameEl || data.focusId !== id) return;
    data.focusId = null;
    nameEl.focus();
  });

  function remove() {
    if (project && data.removeProject(project)) void goto("/projects");
  }

  /** ⌘Z takes back the last edit on this page. */
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

  const templateOptions = TEMPLATES.map((t) => ({ value: t.key, label: `${t.label} — ${t.shape}` }));
</script>

<svelte:window {onkeydown} />

<div class="safe-top mx-auto h-full w-full max-w-2xl overflow-y-auto px-5 pt-4 pb-10 md:px-10 md:pt-8 md:pb-16">
  <a href="/projects" class="press-sm hoverable -mx-2 mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-fg-muted">
    <ArrowLeft size={14} />
    <span class="t-micro">Projects</span>
  </a>

  {#if !data.ready}
    <div class="space-y-3">
      <Skeleton height={44} width="60%" />
      <Skeleton height={120} radius={10} />
    </div>
  {:else if !project || !card}
    <p class="t-body text-fg-muted">That project isn't here any more.</p>
  {:else}
    <header class="mb-6 space-y-4">
      <div class="flex items-start gap-4">
        <button
          type="button"
          aria-label="Change cover"
          onclick={() => (coverDraft = coverDraft === null ? (project.cover ?? "") : null)}
          class="press-sm shrink-0"
        >
          <ProjectCover cover={project.cover} category={card.category} size={56} />
        </button>
        <div class="min-w-0 flex-1 space-y-1">
          <input
            bind:this={nameEl}
            value={project.name}
            oninput={(e) => data.update(project.id, { name: e.currentTarget.value })}
            placeholder="Name the project"
            aria-label="Project name"
            class="t-title -mx-1 h-12 w-full rounded-md border border-transparent bg-transparent px-1 text-fg placeholder:text-fg-faint hover:border-line focus:border-line-strong focus:outline-none"
          />
          <Textarea
            value={project.description}
            oninput={(description) => data.update(project.id, { description })}
            rows={1}
            placeholder="One line on what it is"
            ariaLabel="Description"
            class="-mx-1 bg-transparent px-1 py-1"
          />
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <StatusChip status={project.status} />
          <Popover width={200}>
            {#snippet trigger(open)}
              <IconButton label="More" tone="plain" onclick={open}><MoreHorizontal size={16} class="text-fg-muted" /></IconButton>
            {/snippet}
            {#snippet content(close)}
              {#if project.status === "held"}
                <PopoverItem label="Back to active" onclick={() => { data.setStatus(project, "active"); close(); }} />
              {/if}
              <PopoverItem label="Delete project" tone="danger" onclick={() => { close(); remove(); }} />
            {/snippet}
          </Popover>
        </div>
      </div>

      {#if coverDraft !== null}
        <div class="flex items-center gap-2">
          <Field
            value={coverDraft}
            oninput={(value) => (coverDraft = value)}
            placeholder="An emoji, or an image URL"
            ariaLabel="Cover"
          />
          <Button size="sm" label="Set" onclick={() => { data.update(project.id, { cover: coverDraft?.trim() || null }); coverDraft = null; }} />
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onclick={(e) => (sphereRect = e.currentTarget.getBoundingClientRect())}
          class="press-sm hoverable -mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5"
        >
          <Dot {color} />
          <span class="t-label text-fg">{card.category?.name ?? "Pick a sphere"}</span>
        </button>
        <label class="t-label flex items-center gap-1.5 text-fg-muted">
          <NumberField
            value={project.hoursPerWeek}
            unit="h/wk"
            width="w-12"
            ariaLabel="Hours a week claimed"
            onchange={(hoursPerWeek) => data.update(project.id, { hoursPerWeek: Math.max(0, Math.min(168, hoursPerWeek)) })}
          />
          claimed
        </label>
        <GoalPicker categoryId={project.categoryId} value={card.goal} onchange={(goalId) => data.update(project.id, { goalId })} />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          width={260}
          label="Template"
          value={project.template}
          options={templateOptions}
          onchange={(template: ProjectTemplate) => data.applyTemplate(project, template)}
        />
        {#if project.template === "delivery"}
          <label class="t-label flex items-center gap-1.5 text-fg-muted">
            due
            <input
              type="date"
              value={project.deadline ?? ""}
              onchange={(e) => data.update(project.id, { deadline: e.currentTarget.value || null })}
              aria-label="Deadline"
              class="t-label h-9 rounded-md border border-line bg-surface px-2 text-fg focus:border-line-strong focus:outline-none"
            />
          </label>
        {/if}
      </div>

      {#if project.status === "parked" && project.unparkTrigger}
        <p class="t-label text-fg-muted">Parked until: {project.unparkTrigger}</p>
      {/if}
    </header>

    <div class="space-y-8">
      {#if card.stage && card.checkpointDue}
        <CheckpointCard stage={card.stage} gate={card.gate} day={card.checkpointDue} projectName={project.name} />
      {/if}

      {#if stages.length === 0 && project.template !== "evergreen"}
        <CreateAssist {project} category={card.category} />
      {/if}

      {#if project.template !== "evergreen" || stages.length > 0}
        <section class="space-y-3">
          <h2 class="t-label text-fg-muted">Stages</h2>
          <StageRail {project} {stages} gate={card.gate} {color} ondecide={() => (deciding = true)} />
        </section>
      {/if}

      {#if card.stage}
        <section class="space-y-2">
          <h2 class="t-label text-fg-muted">Subtasks · {card.stage.name}</h2>
          <TaskList stageId={card.stage.id} tasks={currentTasks} />
        </section>
      {/if}

      <section class="space-y-2">
        <h2 class="t-label flex items-baseline justify-between text-fg-muted">
          <span>Hours</span>
          <span class="t-micro text-fg-faint">{formatHoursDecimal(hoursInvested)} in the last {card.hoursByWeek.length || 8} weeks</span>
        </h2>
        {#if data.progress}
          <HoursBars weeks={data.progress.weeks} hours={card.hoursByWeek} claimed={project.hoursPerWeek} {color} />
        {:else}
          <Skeleton height={40} />
        {/if}
        <p class="t-micro text-fg-faint">Blocks on the calendar tagged to this project. Tag one from its card, or drag the project onto the week.</p>
      </section>

      <section class="grid gap-6 sm:grid-cols-2">
        <div class="space-y-2">
          <h2 class="t-label text-fg-muted">Links</h2>
          <LinksList links={project.links} onchange={(links) => data.update(project.id, { links })} />
        </div>
        <div class="space-y-2">
          <h2 class="t-label text-fg-muted">People</h2>
          <PeopleList people={project.people} onchange={(people) => data.update(project.id, { people })} />
        </div>
      </section>
    </div>


    {#if card.stage}
      <DecisionSheet
        open={deciding}
        onclose={() => (deciding = false)}
        stage={card.stage}
        {project}
        gate={card.gate}
        {hoursInvested}
        {isLast}
      />
    {/if}

    {#if sphereRect}
      <CategoryPicker
        rect={sphereRect}
        categories={data.spheres}
        value={project.categoryId}
        onchoose={(categoryId) => {
          sphereRect = null;
          data.update(project.id, { categoryId });
        }}
        onclose={() => (sphereRect = null)}
      />
    {/if}
  {/if}
</div>
