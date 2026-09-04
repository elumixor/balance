<script lang="ts">
  import { AnchoredPopup, Dot } from "$lib/components";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { matchPurposes, purposeRows } from "$lib/projects/purpose-rows";
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

  const rows = $derived(purposeRows());
  const matches = $derived(matchPurposes(rows, query));

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

  function autofocus(node: HTMLInputElement) {
    const focus = () => {
      node.focus({ preventScroll: true });
      if (node.isConnected && document.activeElement !== node) requestAnimationFrame(focus);
    };
    focus();
  }
</script>

<AnchoredPopup {rect} width={260} {onclose}>
  <div class="flex flex-col gap-1.5 p-1.5">
    <input
      use:autofocus
      bind:value={query}
      {onkeydown}
      placeholder="Project or practice"
      spellcheck="false"
      autocomplete="off"
      aria-label="Search projects"
      class="t-body h-9 w-full shrink-0 rounded-md border border-line bg-surface px-2.5
        transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-line-strong
        focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
    />
    <div bind:this={list} class="max-h-60 overflow-y-auto">
      {#if !query.trim() && value}
        <button
          type="button"
          onclick={() => onchoose({ projectId: null, practiceId: null })}
          class="t-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-fg-muted"
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
          class="t-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left {i === active ? 'bg-surface-alt' : ''}"
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
          class="t-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left {active === matches.length
            ? 'bg-surface-alt'
            : ''}"
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
