<script lang="ts">
  import { Button } from "$lib/components";
  import { formatHoursDecimal } from "$lib/ui/format";
  import type { Category } from "$lib/core/records";
  import { projects } from "$lib/core/synced.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";

  /**
   * A sphere that claims more than the ring gives it. Two projects at a time, one question at a
   * time — "higher priority?", then "more fun?" — asking only the comparisons the order still
   * needs, and then the fit: what each project gets under the cap, top of the order first, as a
   * proposal to apply. The pattern across the answers is reported as an observation, not a verdict.
   */
  let { category, over }: { category: Category; over: number } = $props();

  const question = $derived(data.questionFor(category.id));
  const nameOf = (id: string) => projects.all.find((p) => p.id === id)?.name || "Untitled project";
  const fit = $derived(data.allocationFor(category));
  const observation = $derived(data.observationFor(category.id));
  const changes = $derived(fit.filter((f) => f.hours !== f.claimed));
</script>

<div class="space-y-3 rounded-lg border border-line-strong bg-surface p-4">
  <p class="t-label text-fg">
    {category.name} claims {formatHoursDecimal(over)} more a week than the ring gives it.
  </p>

  {#if question}
    <p class="t-micro text-fg-muted">{question.dimension === "priority" ? "Which matters more?" : "Which would you rather do?"}</p>
    <div class="grid grid-cols-2 gap-2">
      {#each [question.aId, question.bId] as id (id)}
        <button
          type="button"
          onclick={() => data.answer(question, id)}
          class="press hoverable rounded-md border border-line px-3 py-3 text-left"
        >
          <span class="t-label block truncate text-fg">{nameOf(id)}</span>
        </button>
      {/each}
    </div>
  {:else}
    {#if observation}
      <p class="t-micro text-fg-muted">{observation}</p>
    {/if}
    <ul class="space-y-1">
      {#each fit as f (f.id)}
        <li class="t-micro flex items-center justify-between gap-3 text-fg-muted">
          <span class="truncate text-fg">{nameOf(f.id)}</span>
          <span class="shrink-0 tabular-nums">
            {#if f.hours !== f.claimed}
              <span class="line-through">{formatHoursDecimal(f.claimed)}</span> → {formatHoursDecimal(f.hours)}
            {:else}
              {formatHoursDecimal(f.hours)}
            {/if}
          </span>
        </li>
      {/each}
    </ul>
    <div class="flex flex-wrap gap-2">
      {#if changes.length > 0}
        <Button size="sm" label="Apply these hours" onclick={() => data.applyAllocation(category)} />
      {/if}
      <Button size="sm" variant="outline" label="Ask again" onclick={() => data.forgetRanking(category.id, "priority")} />
    </div>
  {/if}
</div>
