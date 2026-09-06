<script lang="ts">
  import { goto } from "$app/navigation";
import type { CreateSuggestion } from "$lib/projects/assist";
import type { Project } from "$lib/projects/types";
  import { Button, Field } from "$lib/components";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { assistCreate } from "$lib/projects/queries";
  import { projects } from "$lib/core/synced.svelte";
  import type { Category } from "$lib/core/records";
  import { Sparkles } from "lucide-svelte";
  import { decideOnFor, formatDayKey } from "$lib/projects/decide-on";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { METRIC_LABELS, templateOf } from "$lib/projects/templates";

  /**
   * The assistant's first moment. A vague idea goes in; two or three gate sentences come back,
   * each already a count in a window, with a template and a starting rate. Choosing one lays the
   * stage out. "This is a recurring event, not a project" is one of the answers it can give, and
   * accepting that turns the card into a practice. Nothing happens until a card is pressed.
   */
  let { project, category }: { project: Project; category: Category | null } = $props();

  let idea = $state("");
  let asking = $state(false);
  let unavailable = $state(false);
  let suggestion = $state<CreateSuggestion | null>(null);

  async function ask() {
    const text = idea.trim() || project.name.trim();
    if (!text) return;
    asking = true;
    unavailable = false;
    try {
      const answer = await assistCreate({
        idea: text,
        sphere: category?.name ?? "",
        existingProjects: projects.all
          .filter((p) => p.categoryId === project.categoryId && p.id !== project.id)
          .map((p) => p.name),
      });
      suggestion = answer.available ? answer.suggestion : null;
      unavailable = !answer.available;
    } finally {
      asking = false;
    }
  }

  function choose(index: number) {
    if (!suggestion) return;
    const gate = suggestion.gates[index];
    const template = templateOf(suggestion.template);
    data.update(project.id, { template: suggestion.template, hoursPerWeek: suggestion.hoursPerWeek });
    const [first, ...rest] = template.stages;
    data.addStage(project, {
      name: first?.name ?? "Do it",
      sentence: gate.sentence,
      metric: gate.metric,
      threshold: gate.threshold,
      windowDays: gate.windowDays,
      budgetHours: suggestion.budgetHours,
    });
    for (const later of rest) data.addStage(project, later);
    suggestion = null;
  }

  function recurring() {
    data.convertToPractice(project);
    void goto("/projects");
  }

  const landing = (index: number) =>
    suggestion
      ? formatDayKey(
          decideOnFor({
            startedOn: data.today,
            budgetHours: suggestion.budgetHours,
            hoursPerWeek: suggestion.hoursPerWeek,
            windowDays: suggestion.gates[index].windowDays,
          }),
        )
      : "";
</script>

<div class="space-y-3 rounded-lg border border-dashed border-line-strong p-4">
  {#if !suggestion}
    <div class="flex items-center gap-2">
      <Sparkles size={14} class="shrink-0 text-fg-faint" />
      <Field
        bind:value={idea}
        placeholder={project.name.trim() ? "Say a little more, or just ask" : "What is it, roughly?"}
        ariaLabel="Idea"
        class="flex-1"
      />
      <Button size="sm" variant="outline" label="Suggest gates" loading={asking} onclick={ask} />
    </div>
    {#if unavailable}
      <p class="t-micro text-fg-faint">No model is configured, so there is nothing to suggest — the stages below take a sentence by hand.</p>
    {/if}
  {:else}
    <p class="t-label text-fg">{suggestion.reason}</p>
    {#if suggestion.kind === "recurring"}
      <div class="flex flex-wrap gap-2">
        <Button size="sm" label="Make it a practice" onclick={recurring} />
        <Button size="sm" variant="outline" label="Keep it a project" onclick={() => (suggestion = null)} />
      </div>
    {:else}
      <p class="t-micro text-fg-muted">
        {templateOf(suggestion.template).label} · {formatHoursDecimal(suggestion.hoursPerWeek)}/wk · first stage {formatHoursDecimal(suggestion.budgetHours)}
      </p>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each suggestion.gates as gate, i (gate.sentence)}
          <button type="button" onclick={() => choose(i)} class="press hoverable rounded-md border border-line p-3 text-left">
            <span class="t-micro block text-fg-faint">{String.fromCharCode(65 + i)}</span>
            <span class="t-label block text-fg">{gate.sentence}</span>
            <span class="t-micro block text-fg-muted">
              {METRIC_LABELS[gate.metric]} · {gate.threshold} in {gate.windowDays}d · decided {landing(i)}
            </span>
            <span class="t-micro block text-fg-faint">{gate.countedBy}</span>
          </button>
        {/each}
      </div>
      <Button size="sm" variant="outline" label="None of these" onclick={() => (suggestion = null)} />
    {/if}
  {/if}
</div>
