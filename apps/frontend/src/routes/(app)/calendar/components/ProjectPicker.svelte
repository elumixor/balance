<script lang="ts">
  import { focusWhenReady } from "$lib/ui/focus";
  import { AnchoredPopup, Dot } from "$lib/components";
  import { restColor } from "$lib/ui/colors";
  import { categories, practices, projects } from "$lib/core/synced.svelte";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { Plus, Repeat } from "lucide-svelte";

  /**
   * What an hour was for, chosen by typing — the same shape as the category picker, listing live
   * projects and practices with their sphere's dot. "Nothing in particular" is a real answer and
   * sits at the top, since untagging is how a mis-tagged block is put right.
   */
  let {
    rect,
    value,
    categoryId,
    onchoose,
    onclose,
  }: {
    rect: DOMRect | null;
    /** The sphere a project made from here belongs to — the block's own, when it has one. */
    categoryId?: string;
    /** The current purpose, as `project:<id>` or `practice:<id>`, or "". */
    value?: string;
    onchoose: (purpose: { projectId: string | null; practiceId: string | null }) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let list = $state<HTMLElement>();

  const colorOf = (categoryId: string) => categories.all.find((c) => c.id === categoryId)?.color ?? restColor;

  interface Row {
    key: string;
    name: string;
    color: string;
    practice: boolean;
    purpose: { projectId: string | null; practiceId: string | null };
  }

  const rows = $derived.by((): Row[] => [
    ...projects.all
      .filter((p) => p.status === "active" || p.status === "held")
      .map((p) => ({
        key: `project:${p.id}`,
        name: p.name || "Untitled project",
        color: colorOf(p.categoryId),
        practice: false,
        purpose: { projectId: p.id, practiceId: null },
      })),
    ...practices.all.map((p) => ({
      key: `practice:${p.id}`,
      name: p.name || "Unnamed practice",
      color: colorOf(p.categoryId),
      practice: true,
      purpose: { projectId: null, practiceId: p.id },
    })),
  ]);

  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)));
  });

  /**
   * A name nothing answers to is a project that doesn't exist yet, so the picker offers to make it
   * rather than sending anyone to the gallery and back. It lands in the block's own sphere.
   */
  const newName = $derived.by(() => {
    const q = query.trim();
    if (!q) return null;
    if (rows.some((r) => r.name.toLowerCase() === q.toLowerCase())) return null;
    return q;
  });

  function createProject(name: string) {
    const created = projectsData.create(categoryId, name);
    if (created) onchoose({ projectId: created.id, practiceId: null });
  }

  let active = $state(0);
  $effect(() => {
    query;
    active = query.trim() ? 0 : Math.max(0, matches.findIndex((r) => r.key === value));
  });
  $effect(() => {
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  });

  const options = $derived(newName ? matches.length + 1 : matches.length);

  function move(delta: number) {
    if (options === 0) return;
    active = (active + delta + options) % options;
  }

  function pick(index: number) {
    if (index < matches.length) onchoose(matches[index].purpose);
    else if (newName) createProject(newName);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Enter" && active < options) pick(active);
    else return;
    e.preventDefault();
  }

</script>

<AnchoredPopup {rect} width={260} {onclose}>
  <div class="flex flex-col gap-1.5 p-1.5">
    <input
      use:focusWhenReady
      bind:value={query}
      {onkeydown}
      placeholder="Project or practice"
      spellcheck="false"
      autocomplete="off"
      aria-label="Search projects"
      class="field-boxed w-full shrink-0"
    />
    <div bind:this={list} class="max-h-60 overflow-y-auto">
      {#if !query.trim() && value}
        <button
          type="button"
          onclick={() => onchoose({ projectId: null, practiceId: null })}
          class="menu-row text-fg-muted"
        >
          <span class="w-3"></span>
          Nothing in particular
        </button>
      {/if}
      {#each matches as row, i (row.key)}
        <button
          type="button"
          onclick={() => onchoose(row.purpose)}
          onpointermove={() => (active = i)}
          aria-pressed={row.key === value}
          class="menu-row {i === active ? 'bg-surface-alt' : ''}"
        >
          {#if row.practice}
            <Repeat size={12} style="color:{row.color}" />
          {:else}
            <span class="flex w-3 justify-center"><Dot color={row.color} /></span>
          {/if}
          <span class="flex-1 truncate {row.key === value ? 'text-fg' : 'text-fg-muted'}">{row.name}</span>
        </button>
      {/each}
      {#if newName}
        <button
          type="button"
          onclick={() => createProject(newName)}
          onpointermove={() => (active = matches.length)}
          class="menu-row {active === matches.length ? 'bg-surface-alt' : ''}"
        >
          <span class="flex w-3 justify-center"><Plus size={12} /></span>
          <span class="flex-1 truncate text-fg-muted">New project “{newName}”</span>
        </button>
      {:else if matches.length === 0}
        <p class="t-micro py-6 text-center text-fg-faint">Nothing by that name.</p>
      {/if}
    </div>
  </div>
</AnchoredPopup>
