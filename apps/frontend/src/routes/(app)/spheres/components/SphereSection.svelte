<script lang="ts">
  import { Field, NumberField } from "$lib/components";
  import { type Draft, fromUnit, toUnit } from "$lib/planning/category-drafts.svelte";
  import { categoryDrafts as week } from "$lib/planning/category-drafts.svelte";
  import type { SphereProgress } from "$lib/planning/types";
  import { practicesData as data } from "$lib/practices/practices-data.svelte";
  import { Ellipsis, Plus, Repeat } from "lucide-svelte";
  import IconPicker from "./IconPicker.svelte";
  import KeepLink from "./KeepLink.svelte";
  import PartRow from "./PartRow.svelte";
  import PracticeRow from "./PracticeRow.svelte";
  import WeekBar from "./WeekBar.svelte";

  /**
   * One sphere of the week, all of it in one place: what it looks like and what it is called, the
   * hours the ring gives it, its week against them, its parts, and the practices that never
   * complete beneath it.
   */
  let {
    draft,
    taken,
    progressOf,
    onupdate,
    onmenu,
    onpartmenu,
  }: {
    draft: Draft;
    /** Icons other spheres already wear — faded in the picker, still pickable. */
    taken: string[];
    onupdate: (patch: Partial<Draft>) => void;
    onmenu: (at: DOMRect) => void;
    /** This week's hours for a sphere or part, when the calendar has answered. */
    progressOf: (id: string) => SphereProgress | null;
    onpartmenu: (id: string, at: DOMRect) => void;
  } = $props();

  const practices = $derived(data.of(draft.id));
  const parts = $derived(week.parts(draft.id));
  const progress = $derived(progressOf(draft.id));
  const label = $derived(draft.name || "New sphere");

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
    {#if progress || draft.urn}
      <div class="space-y-0.5 pl-9 pr-10">
        {#if progress}<WeekBar {progress} color={draft.color} />{/if}
        {#if draft.urn}<KeepLink urn={draft.urn} />{/if}
      </div>
    {/if}
  </div>

  <div class="pl-9">
    {#if parts.length > 0}
      <div class="my-1 divide-y divide-line rounded-lg border border-line bg-surface px-3">
        {#each parts as part (part.key)}
          <PartRow
            draft={part}
            progress={progressOf(part.id)}
            onupdate={(patch) => week.update(part.key, patch)}
            onmenu={(at) => onpartmenu(part.id, at)}
          />
        {/each}
      </div>
    {/if}

    {#if practices.length > 0}
      <div class="my-1 divide-y divide-line rounded-lg border border-line bg-surface px-3">
        {#each practices as practice (practice.id)}
          <PracticeRow {practice} progress={data.progress?.practices[practice.id] ?? null} color={draft.color} />
        {/each}
      </div>
    {/if}

    <div class="flex items-center gap-1">
      <button type="button" onclick={() => data.create(draft.id)} class="bare-button t-micro h-7 px-2">
        <Repeat size={12} />
        Practice
      </button>
      <button type="button" onclick={() => week.createPart(draft.id)} class="bare-button t-micro h-7 px-2">
        <Plus size={12} />
        Part
      </button>
    </div>
  </div>
</section>

