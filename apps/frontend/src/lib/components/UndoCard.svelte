<script lang="ts">
  import { Undo2, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  /**
   * Something just went, and can come back. It sits in the corner pile the app already speaks
   * through, and stands in for an "are you sure?" — a question asked before every delete is
   * answered without reading, and a native `confirm()` is never shown inside the Mac's webview.
   */
  let { id, message, onundo }: { id: string; message: string; onundo: () => void } = $props();
</script>

<div
  class="flex w-full items-center gap-0.5 rounded-xl border border-line-strong bg-surface py-1.5 pr-1.5 pl-3
    shadow-(--shadow-float)"
>
  <p class="t-label min-w-0 flex-1 truncate text-fg">{message}</p>
  <button
    type="button"
    class="press-sm t-label flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-fg hover:bg-surface-alt"
    onclick={() => {
      onundo();
      toast.dismiss(id);
    }}
  >
    <Undo2 size={14} />Undo
  </button>
  <button
    type="button"
    class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
    aria-label="Dismiss"
    title="Dismiss"
    onclick={() => toast.dismiss(id)}
  >
    <X size={15} />
  </button>
</div>
