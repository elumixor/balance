<script lang="ts">
  import { goto } from "$app/navigation";
  import { Field, NotionLinkDialog, NotionMark, NumberField } from "$lib/components";
  import { type Draft, fromUnit, toUnit } from "$lib/planning/category-drafts.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import { rowsOf } from "$lib/projects/tree";
  import { formatHoursDecimal } from "$lib/ui/format";
  import { Ellipsis, Plus, Repeat } from "lucide-svelte";
  import IconPicker from "./IconPicker.svelte";
  import PracticeRow from "./PracticeRow.svelte";
  import ProjectRow from "./ProjectRow.svelte";
  import SphereClaimBar from "./SphereClaimBar.svelte";

  /**
   * One sphere of the week, all of it in one place: what it looks like and what it is called, the
   * hours the ring gives it, how those hours are already spoken for by its projects, the projects
   * themselves as the tree they form, and the practices that never complete beneath them.
   */
  let {
    draft,
    taken,
    onupdate,
    onmenu,
  }: {
    draft: Draft;
    /** Icons other spheres already wear — faded in the picker, still pickable. */
    taken: string[];
    onupdate: (patch: Partial<Draft>) => void;
    onmenu: (at: DOMRect) => void;
  } = $props();

  const group = $derived(data.groups.find((one) => one.category.id === draft.id) ?? null);
  const label = $derived(draft.name || "New sphere");

  let fromNotion = $state(false);

  async function add() {
    const created = data.create(null, draft.id);
    if (created) await goto(`/projects/${created.id}`);
  }

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    const at = event.type === "contextmenu"
      ? new DOMRect(event.clientX, event.clientY, 0, 0)
      : (event.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu(at);
  }
</script>

<section id="sphere-{draft.id}" class="scroll-mt-6 space-y-2">
  <div class="space-y-1.5">
    <div class="flex items-center gap-2" role="presentation" oncontextmenu={openMenu}>
      <IconPicker icon={draft.icon} color={draft.color} {taken} size={28} onchange={onupdate} />
      <Field
        value={draft.name}
        variant="bare"
        placeholder="New sphere"
        autocapitalize="sentences"
        ariaLabel="Sphere name"
        oninput={(name) => onupdate({ name })}
        class="t-heading min-w-0 flex-1"
      />
      <NumberField
        value={toUnit(draft.hours, "h")}
        unit="h"
        ariaLabel="{label} hours a week"
        onchange={(value) => onupdate({ hours: fromUnit(value, "h") })}
      />
      <NumberField
        width="w-8"
        value={toUnit(draft.hours, "%")}
        unit="%"
        ariaLabel="{label} share of the week"
        onchange={(value) => onupdate({ hours: fromUnit(value, "%") })}
      />
      <button type="button" onclick={openMenu} aria-label="{label} options" class="bare-button size-8">
        <Ellipsis size={15} />
      </button>
    </div>

    {#if group && group.claimed > 0}
      <div class="flex items-center gap-3 pl-9">
        <div class="flex-1">
          <SphereClaimBar
            projects={group.nodes.map((node) => node.item)}
            hours={draft.hours}
            color={draft.color}
          />
        </div>
        <span class="t-data-micro shrink-0 text-fg-faint">
          {formatHoursDecimal(group.claimed)} of {formatHoursDecimal(draft.hours)}h in projects
        </span>
      </div>
    {/if}
  </div>

  <div class="pl-9">
    {#each rowsOf(group?.nodes ?? []) as row (row.item.id)}
      <div class="list-item-in"><ProjectRow card={data.cardOf(row.item)} depth={row.depth} /></div>
    {/each}

    {#if group && group.practices.length > 0}
      <div class="my-1 divide-y divide-line rounded-lg border border-line bg-surface px-3">
        {#each group.practices as practice (practice.id)}
          <PracticeRow {practice} progress={data.progress?.practices[practice.id] ?? null} color={draft.color} />
        {/each}
      </div>
    {/if}

    <div class="flex items-center gap-1">
      <button type="button" onclick={add} class="bare-button t-micro h-7 px-2">
        <Plus size={12} />
        Project
      </button>
      <button type="button" onclick={() => (fromNotion = true)} class="bare-button t-micro h-7 px-2">
        <NotionMark size={12} />
        From Notion
      </button>
      <button type="button" onclick={() => data.createPractice(draft.id)} class="bare-button t-micro h-7 px-2">
        <Repeat size={12} />
        Practice
      </button>
    </div>
  </div>
</section>

<NotionLinkDialog project={null} categoryId={draft.id} open={fromNotion} onclose={() => (fromNotion = false)} />
