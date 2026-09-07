<script lang="ts">
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { RotateCcw, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  /**
   * One update, already installed, waiting on the restart.
   *
   * The install needed nobody; the relaunch does, and until now it was only offered from the menu
   * bar and a settings row — both places somebody has to think to look. This is the third: a card
   * in the corner the app already uses to speak, the once a person looks at the app after the
   * download lands.
   */
  let { id, version }: { id: string; version: string } = $props();
</script>

<div
  class="flex w-full items-center gap-0.5 rounded-xl border border-line-strong bg-surface py-1.5 pr-1.5 pl-3
    shadow-(--shadow-float)"
>
  <p class="t-label min-w-0 flex-1 truncate text-fg">Balance {version} is ready</p>
  <button
    type="button"
    class="press-sm t-label flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-fg hover:bg-surface-alt"
    onclick={() => void desktopUpdates.restart()}
  >
    <RotateCcw size={14} />Restart
  </button>
  <button
    type="button"
    class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
    aria-label="Later"
    title="Later"
    onclick={() => toast.dismiss(id)}
  >
    <X size={15} />
  </button>
</div>
