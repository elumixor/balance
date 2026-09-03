<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Field from "$lib/components/Field.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { assistEvent } from "$lib/queries";
  import { practices, projects } from "$lib/synced.svelte";
  import type { CalendarEvent, Category, EventPlan } from "$lib/types";
  import { Check, Sparkles, X } from "lucide-svelte";
  import { calendarData as data } from "./calendar-data.svelte";

  /**
   * The assistant's sixth moment, on the block itself. One press asks what this hour is for; the
   * answer is a project to link, a task it already is, the steps inside it, a first sentence to
   * read when it starts, and sometimes a different length. Every part is applied by its own
   * button, so a plan half-right is taken half. When the block is too vague to plan, the model
   * asks one question and the pills are the answers.
   */
  let {
    event,
    category,
    onbrief,
    onhours,
    onclose,
  }: {
    event: CalendarEvent;
    category: Category | null;
    /** Writes the plan into the block's notes; the card owns the field and the save. */
    onbrief: (text: string) => void;
    /** Resizes the block; the card owns the clock fields. */
    onhours: (hours: number) => void;
    onclose: () => void;
  } = $props();

  let asking = $state(false);
  let unavailable = $state(false);
  let plan = $state<EventPlan | null>(null);
  let answers = $state<{ question: string; answer: string }[]>([]);
  let typed = $state("");
  let applied = $state(new Set<string>());

  const hours = $derived((new Date(event.end).getTime() - new Date(event.start).getTime()) / 3_600_000);
  const project = $derived(plan?.projectId ? (projects.all.find((p) => p.id === plan?.projectId) ?? null) : null);
  const stage = $derived(project ? projectsData.currentStage(project.id) : null);
  const task = $derived(
    plan?.taskId && stage ? (projectsData.tasksByStage.get(stage.id)?.find((t) => t.id === plan?.taskId) ?? null) : null,
  );
  const linkable = $derived(project !== null && (project.id !== event.projectId || (task?.id ?? null) !== event.taskId));
  const resizable = $derived(plan?.hours !== null && plan?.hours !== undefined && Math.abs(plan.hours - hours) > 0.01);
  const done = $derived(plan?.question === null);

  /** Everything the model is given comes from what the screens already hold; nothing is fetched. */
  function context() {
    const tagged = projects.all.find((p) => p.id === event.projectId) ?? null;
    const running = tagged ? projectsData.currentStage(tagged.id) : null;
    const sphere =
      category?.name ??
      (event.practiceId ? (practices.all.find((p) => p.id === event.practiceId)?.name ?? "") : "");
    return {
      title: event.title,
      description: event.description ?? "",
      hours,
      sphere,
      project: tagged
        ? {
            id: tagged.id,
            name: tagged.name,
            description: tagged.description,
            stage: running?.name ?? "",
            sentence: running?.sentence ?? "",
            hoursPerWeek: tagged.hoursPerWeek,
            tasks: (running ? (projectsData.tasksByStage.get(running.id) ?? []) : []).map((t) => ({
              id: t.id,
              title: t.title,
              estimateHours: t.estimateHours,
              done: t.done,
            })),
          }
        : null,
      candidates: tagged
        ? []
        : projects.all
            .filter((p) => p.status === "active" && (!category || p.categoryId === category.id))
            .map((p) => ({ id: p.id, name: p.name, description: p.description })),
      answers,
    };
  }

  async function ask() {
    asking = true;
    unavailable = false;
    try {
      const r = await assistEvent(context());
      plan = r.available ? r.suggestion : null;
      unavailable = !r.available;
      applied = new Set();
    } finally {
      asking = false;
    }
  }

  function answer(text: string) {
    if (!plan?.question || !text.trim()) return;
    answers = [...answers, { question: plan.question.text, answer: text.trim() }];
    typed = "";
    void ask();
  }

  function link() {
    if (!project) return;
    void data.tagEvent(event, { projectId: project.id, practiceId: null, taskId: task?.id ?? null });
    applied = new Set([...applied, "link"]);
  }

  /** The steps become subtasks under the running stage, and the block is linked to the first. */
  function addSteps() {
    if (!plan || !stage) return;
    const created = plan.steps.map((step) => {
      const t = projectsData.addTask(stage.id, step.title);
      projectsData.updateTask(t.id, { estimateHours: step.estimateHours });
      return t;
    });
    if (created[0] && !task) void data.tagEvent(event, { projectId: stage.projectId, practiceId: null, taskId: created[0].id });
    applied = new Set([...applied, "steps"]);
  }

  function brief() {
    if (!plan) return;
    const lines = [plan.brief, ...plan.steps.map((s, i) => `${i + 1}. ${s.title} (${formatHoursAndMinutes(s.estimateHours)})`)];
    onbrief(lines.filter(Boolean).join("\n"));
    applied = new Set([...applied, "brief"]);
  }

  function resize() {
    if (!plan?.hours) return;
    onhours(plan.hours);
    applied = new Set([...applied, "hours"]);
  }

  function applyAll() {
    if (linkable && !applied.has("link")) link();
    if (plan && plan.steps.length > 0 && stage && !applied.has("steps")) addSteps();
    if (!applied.has("brief")) brief();
    if (resizable && !applied.has("hours")) resize();
  }

  $effect(() => {
    void ask();
  });
</script>

{#snippet apply(key: string, label: string, action: () => void, primary = false)}
  {#if applied.has(key)}
    <span class="t-micro flex items-center gap-1 text-fg-muted"><Check size={12} /> {label}</span>
  {:else}
    <Button size="sm" variant={primary ? "solid" : "outline"} {label} onclick={action} />
  {/if}
{/snippet}

<div class="space-y-2 rounded-lg border border-dashed border-line-strong p-3">
  <div class="flex items-center gap-2">
    <Sparkles size={14} class="shrink-0 text-fg-faint" />
    <span class="t-label min-w-0 flex-1 truncate text-fg-muted">
      {asking ? "Working it out…" : (plan?.summary ?? "Plan this block")}
    </span>
    <button type="button" class="press-sm rounded-md p-1 text-fg-faint hover:text-fg" aria-label="Close" onclick={onclose}>
      <X size={14} />
    </button>
  </div>

  {#if unavailable}
    <p class="t-micro text-fg-faint">No model is configured, so there is nothing to suggest.</p>
  {:else if plan && !asking}
    {#if plan.question}
      <p class="t-label text-fg">{plan.question.text}</p>
      <div class="flex flex-wrap gap-1.5">
        {#each plan.question.options as option (option)}
          <Chip label={option} onclick={() => answer(option)} />
        {/each}
      </div>
      <div class="flex items-center gap-2">
        <Field bind:value={typed} placeholder="Or say it your way" ariaLabel="Your answer" class="flex-1" />
        <Button size="sm" variant="outline" label="Answer" disabled={!typed.trim()} onclick={() => answer(typed)} />
      </div>
    {/if}

    {#if done}
      {#if plan.brief}<p class="t-label whitespace-pre-wrap text-fg">{plan.brief}</p>{/if}
      {#if plan.steps.length > 0}
        <ol class="space-y-0.5 pl-1">
          {#each plan.steps as step, i (step.title)}
            <li class="t-micro flex gap-2 text-fg-muted">
              <span class="text-fg-faint">{i + 1}.</span>
              <span class="min-w-0 flex-1">{step.title}</span>
              <span class="shrink-0 text-fg-faint">{formatHoursAndMinutes(step.estimateHours)}</span>
            </li>
          {/each}
        </ol>
      {/if}
      {#if project}
        <p class="t-micro text-fg-muted">
          For {project.name}{task ? ` · ${task.title}` : ""}{stage ? "" : " · no stage running, so steps have nowhere to go"}
        </p>
      {/if}
      <div class="flex flex-wrap items-center gap-2 pt-1">
        {@render apply("all", "Apply all", applyAll, true)}
        {#if linkable}{@render apply("link", task ? "Link task" : "Link project", link)}{/if}
        {#if plan.steps.length > 0 && stage}{@render apply("steps", `Add ${plan.steps.length} subtasks`, addSteps)}{/if}
        {@render apply("brief", "Write to notes", brief)}
        {#if resizable && plan.hours !== null}{@render apply("hours", `Make it ${formatHoursAndMinutes(plan.hours)}`, resize)}{/if}
        <Button size="sm" variant="outline" label="Again" onclick={() => void ask()} />
      </div>
    {/if}
  {/if}
</div>
