<script lang="ts">
  import AnchoredPopup from "$lib/components/AnchoredPopup.svelte";
  import Dot from "$lib/components/Dot.svelte";
  import { restColor } from "$lib/colors";
  import { categories, practices, projects } from "$lib/synced.svelte";
  import { Repeat } from "lucide-svelte";

  /**
   * What an hour was for, chosen by typing — the same shape as the category picker, listing live
   * projects and practices with their sphere's dot. "Nothing in particular" is a real answer and
   * sits at the top, since untagging is how a mis-tagged block is put right.
   */
  let {
    rect,
    value,
    onchoose,
    onclose,
  }: {
    rect: DOMRect | null;
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

  let active = $state(0);
  $effect(() => {
    query;
    active = query.trim() ? 0 : Math.max(0, matches.findIndex((r) => r.key === value));
  });
  $effect(() => {
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  });

  function move(delta: number) {
    if (matches.length === 0) return;
    active = (active + delta + matches.length) % matches.length;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Enter" && matches[active]) onchoose(matches[active].purpose);
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
      {#if matches.length === 0}
        <p class="t-micro py-6 text-center text-fg-faint">Nothing by that name.</p>
      {/if}
    </div>
  </div>
</AnchoredPopup>
