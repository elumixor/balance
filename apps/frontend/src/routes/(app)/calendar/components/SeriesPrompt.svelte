<script lang="ts">
  import { X } from "lucide-svelte";
  import { fly } from "svelte/transition";

  /**
   * The corner card the two series prompts share: one line naming what is happening to which
   * event, the three scopes as plain text actions, and a dismiss. Drawn the way the update and
   * problem cards are — a row, no ground under an action until it is pointed at — so a choice
   * about a series reads as the same kind of thing as every other card in that corner. The first
   * scope is the default, and the only one drawn on a ground.
   *
   * Enter takes the first scope; Escape dismisses.
   */
  let {
    /** "Change" or "Delete" — the verb the row starts with, followed by the event's name. */
    verb,
    title,
    /** Tooltip for each scope, in order: this one, from here on, all. */
    hints,
    cancelHint,
    onchoose,
    oncancel,
  }: {
    verb: string;
    title: string;
    hints: [string, string, string];
    cancelHint: string;
    onchoose: (scope: "instance" | "following" | "all") => void;
    oncancel: () => void;
  } = $props();

  const scopes = [
    { scope: "instance", label: "This one" },
    { scope: "following", label: "From here on" },
    { scope: "all", label: "All" },
  ] as const;

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onchoose("instance");
    } else if (e.key === "Escape") {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="fixed right-3 bottom-3 z-50 max-w-[calc(100vw-24px)]" transition:fly={{ y: 16, duration: 180 }}>
  <div
    class="flex items-center gap-0.5 rounded-xl border border-line-strong bg-surface py-1.5 pr-1.5 pl-3
      shadow-(--shadow-float)"
    role="group"
    aria-label="{verb} {title || 'Untitled'}"
  >
    <p class="t-label min-w-0 max-w-56 flex-1 truncate pr-2 text-fg">
      {verb} “{title || "Untitled"}”
    </p>
    {#each scopes as { scope, label }, i (scope)}
      <button
        type="button"
        class="press-sm t-label shrink-0 rounded-md px-2 py-1 whitespace-nowrap hover:bg-surface-alt
          {i === 0 ? 'bg-surface-alt text-fg' : 'text-fg-muted hover:text-fg'}"
        title={hints[i]}
        onclick={() => onchoose(scope)}
      >
        {label}
      </button>
    {/each}
    <button
      type="button"
      class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
      aria-label={cancelHint}
      title={cancelHint}
      onclick={oncancel}
    >
      <X size={15} />
    </button>
  </div>
</div>
